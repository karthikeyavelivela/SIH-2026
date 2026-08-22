import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import {
  findCandidateMuthas,
  dedupeById,
  DRIVER_WILLING_RADIUS_KM,
  HAMALI_WILLING_RADIUS_KM,
} from '../services/matching.service';
import {
  acceptAsDriver,
  acceptAsHamaliSolo,
  acceptAsMuthaLeader,
  rejectBooking,
} from '../services/bookingAssignment.service';
import { emitBookingMatched, emitBookingStatus } from '../realtime/emitters';
import { notifyMuthaOfferSettled } from '../realtime/offerEngine';
import { uploadImage } from '../services/cloudinary.service';
import { detectZeroDistanceFullFare } from '../services/fraudDetection.service';

// Phase 2 polling scope: a single fixed search radius, not the spec's real
// "start small, widen if no response" expanding search — that behavior is
// meaningfully tied to the sequential-timed-offer flow (Phase 3, sockets),
// where "no response" is an observable event. Polling has no such signal
// to widen on, so a single generous radius is the honest Phase 2 stand-in.
// Phase 3's offer engine (realtime/offerEngine.ts) reuses this same
// constant for its own candidate search.
export const SEARCH_RADIUS_KM = 25;

// How many of the most-recently-created open bookings a Mutha leader's feed
// will consider. findCandidateMuthas answers "which groups qualify for THIS
// booking" (correct and already used by the vehicle/solo-hamali matching
// path); a leader's own request feed needs the reverse — "which bookings
// does MY group qualify for" — which this module gets by running that
// check per open booking. That's an O(open bookings) scan, same documented
// platform-wide-scan tradeoff already called out for mutha_leader matching
// elsewhere in this codebase. Bounding the candidate set keeps a single
// leader's poll cheap; Phase 5 (or a booking-side workerId index) is the
// real fix if open-booking volume grows past this.
const MUTHA_FEED_SCAN_LIMIT = 50;

const openStatus = { $in: ['requested', 'searching'] };

function assertAssignedToBooking(booking: IBooking, userId: string, role: string, muthaId?: string): void {
  const isDriver = role === 'driver' && booking.assignedDriverIds.some((id) => id.toString() === userId);
  const isHamaliSolo = role === 'hamali_solo' && booking.assignedHamaliIds.some((id) => id.toString() === userId);
  const isMuthaLeader =
    role === 'mutha_leader' && !!muthaId && booking.assignedMuthaId?.toString() === muthaId;
  if (!isDriver && !isHamaliSolo && !isMuthaLeader) {
    throw new ApiError(403, 'You are not assigned to this booking');
  }
}

// ---- GET /api/requests — candidate open bookings for the caller's role ----
// Still the browse/poll surface even with Phase 3's push offers layered on
// top — a worker can always look at everything open near them, not just
// whatever they were most recently pushed.

export const listRequests = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  if (role === 'driver') {
    const vehicle = await Vehicle.findOne({ ownerId: userId });
    if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
    if (vehicle.availabilityStatus !== 'online') {
      res.status(200).json({ requests: [] });
      return;
    }
    // A vehicle that failed its last compliance inspection sees an empty
    // list, same shape as the offline case above — not an error, just
    // nothing to offer them until they pass a fresh inspection.
    if (vehicle.complianceStatus === 'non_compliant') {
      res.status(200).json({ requests: [] });
      return;
    }
    const driverBase = {
      status: openStatus,
      type: { $in: ['truck', 'combo'] as const },
      assignedDriverIds: { $size: 0 },
      rejectedByUserIds: { $ne: userId },
      'requiredVehicles.0.capacityKg': { $lte: vehicle.capacityKg },
      // Phase 6.2 — a booking open for bidding isn't flat-fare acceptable
      // (bookingAssignment.service.ts's acceptAsDriver rejects it with a
      // 409 either way); excluded here too so this browse list never shows
      // a doomed "Accept" button for one — GET /api/loadboard is where it
      // belongs, with a bid form instead.
      openForBidding: { $ne: true },
    };
    // Same two-tier search as matching.service: live GPS at the normal
    // radius, plus a second wider pass anchored on the driver's own
    // self-set willing-location (if they set one) — this is what makes
    // "set a home base, get found before your GPS ping does" actually
    // true for the browse/poll list a driver looks at, not just the
    // (Phase 3, socket-only) push-offer path in offerEngine.ts.
    const [live, willing] = await Promise.all([
      Booking.find({
        ...driverBase,
        pickupLocation: {
          $near: { $geometry: vehicle.currentLocation, $maxDistance: SEARCH_RADIUS_KM * 1000 },
        },
      }).limit(20),
      vehicle.willingLocation?.coordinates?.length === 2
        ? Booking.find({
            ...driverBase,
            pickupLocation: {
              $near: {
                $geometry: vehicle.willingLocation,
                $maxDistance: DRIVER_WILLING_RADIUS_KM * 1000,
              },
            },
          }).limit(20)
        : Promise.resolve([]),
    ]);
    res.status(200).json({ requests: dedupeById([live, willing]).slice(0, 20) });
    return;
  }

  if (role === 'hamali_solo') {
    const profile = await HamaliProfile.findOne({ userId, type: 'solo' });
    if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
    if (profile.availabilityStatus !== 'online') {
      res.status(200).json({ requests: [] });
      return;
    }
    const hamaliBase = {
      status: openStatus,
      type: { $in: ['hamali', 'combo'] as const },
      rejectedByUserIds: { $ne: userId },
      $expr: { $lt: [{ $size: '$assignedHamaliIds' }, '$requiredHamaliCount'] },
      // See the matching comment on driverBase above.
      openForBidding: { $ne: true },
    };
    const [live, willing] = await Promise.all([
      Booking.find({
        ...hamaliBase,
        pickupLocation: {
          $near: { $geometry: profile.currentLocation, $maxDistance: SEARCH_RADIUS_KM * 1000 },
        },
      }).limit(20),
      profile.willingLocation?.coordinates?.length === 2
        ? Booking.find({
            ...hamaliBase,
            pickupLocation: {
              $near: {
                $geometry: profile.willingLocation,
                $maxDistance: HAMALI_WILLING_RADIUS_KM * 1000,
              },
            },
          }).limit(20)
        : Promise.resolve([]),
    ]);
    res.status(200).json({ requests: dedupeById([live, willing]).slice(0, 20) });
    return;
  }

  if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

    const openBookings = await Booking.find({
      status: openStatus,
      type: { $in: ['hamali', 'combo'] },
      rejectedByUserIds: { $ne: userId },
      $expr: { $lt: [{ $size: '$assignedHamaliIds' }, '$requiredHamaliCount'] },
      // See the matching comment on driverBase above.
      openForBidding: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(MUTHA_FEED_SCAN_LIMIT);

    const qualifying: IBooking[] = [];
    for (const booking of openBookings) {
      const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
      const candidates = await findCandidateMuthas({
        pickup: booking.pickupLocation.coordinates,
        maxDistanceKm: SEARCH_RADIUS_KM,
        requiredHamaliCount: remaining,
      });
      if (candidates.some((c) => c._id.toString() === mutha._id.toString())) {
        qualifying.push(booking);
      }
    }
    res.status(200).json({ requests: qualifying.slice(0, 20) });
    return;
  }

  throw new ApiError(403, 'This role does not receive job requests');
});

// ---- POST /api/requests/:id/accept ----

export const acceptRequest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const bookingId = req.params.id;

  // Mandatory-rating gate lives in bookingAssignment.service now (see
  // assertNoUnratedCompletedBooking) so it applies uniformly to both this
  // REST path and the Phase 3 offer-engine's socket accept path.
  let booking: IBooking;
  if (role === 'driver') {
    booking = await acceptAsDriver(userId, bookingId);
  } else if (role === 'hamali_solo') {
    booking = await acceptAsHamaliSolo(userId, bookingId);
  } else if (role === 'mutha_leader') {
    const memberIds: string[] = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
    booking = await acceptAsMuthaLeader(userId, bookingId, memberIds);
    // Settles (clears or advances) any pending Phase 3 offer-engine state
    // for this leader — see notifyMuthaOfferSettled's doc comment for why
    // a Mutha leader's assignment can't be settled inline in
    // respondToMuthaHamaliOffer the way a solo hamali's/driver's can.
    await notifyMuthaOfferSettled(bookingId, userId, booking);
  } else {
    throw new ApiError(403, 'This role does not receive job requests');
  }

  // Push the same "you've been matched" event a Phase 3 offer-engine accept
  // would emit — a worker who accepted via the browse list (rather than a
  // pushed offer) still notifies the customer's live track screen instantly
  // instead of the customer having to wait for their next poll.
  await emitBookingMatched(booking);
  res.status(200).json({ booking });
});

// ---- POST /api/requests/:id/reject ----

export const rejectRequest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  if (!['driver', 'hamali_solo', 'mutha_leader'].includes(role)) {
    throw new ApiError(403, 'This role does not receive job requests');
  }
  const booking = await rejectBooking(userId, req.params.id);
  res.status(200).json({ booking });
});

// ---- POST /api/requests/:id/start (accepted -> in_progress) ----

export const startJob = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  let muthaId: string | undefined;
  if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    muthaId = mutha?._id.toString();
  }
  assertAssignedToBooking(booking, userId, role, muthaId);

  if (booking.status !== 'accepted') {
    throw new ApiError(400, `Cannot start a job that is ${booking.status}`);
  }
  booking.status = 'in_progress';
  booking.statusHistory.push({ status: 'in_progress', timestamp: new Date() });
  await booking.save();
  emitBookingStatus(booking);
  res.status(200).json({ booking });
});

// ---- POST /api/requests/:id/complete (in_progress -> completed) ----

export const completeJob = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  let muthaId: string | undefined;
  if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    muthaId = mutha?._id.toString();
  }
  assertAssignedToBooking(booking, userId, role, muthaId);

  if (booking.status !== 'in_progress') {
    throw new ApiError(400, `Cannot complete a job that is ${booking.status}`);
  }
  booking.status = 'completed';
  booking.statusHistory.push({ status: 'completed', timestamp: new Date() });
  await booking.save();

  // Free the worker(s) back up for their next job — nothing else transitions
  // availabilityStatus off 'on_job' once a job finishes.
  if (booking.assignedDriverIds.length > 0) {
    await Vehicle.updateMany({ ownerId: { $in: booking.assignedDriverIds } }, { availabilityStatus: 'online' });
  }
  if (booking.assignedHamaliIds.length > 0) {
    await HamaliProfile.updateMany(
      { userId: { $in: booking.assignedHamaliIds } },
      { availabilityStatus: 'online' }
    );
  }

  // Fire-and-forget — a fraud-detection hiccup never blocks a legitimate completion.
  detectZeroDistanceFullFare(booking._id.toString()).catch(() => {});

  emitBookingStatus(booking);
  res.status(200).json({ booking });
});

// ---- POST /api/requests/:id/proof-photo ----
// Captured inline as part of the status-button flow — pickup proof before
// 'start', delivery proof before 'complete' — not a separate menu item.
// Accepts a base64 data URL rather than multipart/form-data: no multer
// dependency exists in this codebase yet, and a data URL in a JSON body is
// simplest for a single small photo per stage.

const MAX_PROOF_PHOTO_BYTES = 5 * 1024 * 1024; // 5MB — generous for a compressed phone-camera JPEG, cheap ceiling against abuse

export const uploadProofPhoto = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { stage, imageBase64 } = req.body as { stage: 'pickup' | 'delivery'; imageBase64: string };

  const booking = await Booking.findById(req.params.id);
  if (!booking) throw new ApiError(404, 'Booking not found');

  let muthaId: string | undefined;
  if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    muthaId = mutha?._id.toString();
  }
  assertAssignedToBooking(booking, userId, role, muthaId);

  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(imageBase64 ?? '');
  if (!match) throw new ApiError(400, 'imageBase64 must be a data:image/(png|jpeg|webp);base64,... URL');
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength > MAX_PROOF_PHOTO_BYTES) throw new ApiError(400, 'Photo too large (max 5MB)');

  const { url } = await uploadImage(buffer, `bookings/${booking._id}/proof`);
  booking.proofPhotos = { ...booking.proofPhotos, [stage]: url };
  await booking.save();

  emitBookingStatus(booking);
  res.status(200).json({ booking });
});

// ---- GET /api/requests/mine — bookings I'm currently assigned to ----

export const myAssignedBookings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  let filter: Record<string, unknown>;
  if (role === 'driver') {
    filter = { assignedDriverIds: userId };
  } else if (role === 'hamali_solo') {
    filter = { assignedHamaliIds: userId };
  } else if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');
    filter = { assignedMuthaId: mutha._id };
  } else if (role === 'mutha_member') {
    // Members don't accept/reject (leader-controlled), but they do need to
    // see whatever job their leader assigned them onto.
    filter = { assignedHamaliIds: userId };
  } else {
    throw new ApiError(403, 'This role has no assigned-booking view');
  }

  // Populated separately from raw `bookings` (rather than mutating
  // customerId in place) so this stays additive — nothing that already
  // reads customerId as a plain string id on an assigned booking breaks.
  // This is what lets a worker's active-job screen show who they're
  // actually meeting, the same parity the customer side already has via
  // AssignedRow — without inventing a fake "call" button neither side has
  // real telephony for (see customer track page's focusChat comment).
  const bookings = await Booking.find(filter)
    .sort({ createdAt: -1 })
    .limit(100)
    .populate<{ customerId: { _id: unknown; name: string; profilePhoto?: string; ratingAvg: number; ratingCount: number } }>(
      'customerId',
      'name profilePhoto ratingAvg ratingCount'
    );

  const withCustomer = bookings.map((b) => {
    const obj = b.toObject();
    const populatedCustomer = obj.customerId as unknown as {
      _id: unknown;
      name: string;
      profilePhoto?: string;
      ratingAvg: number;
      ratingCount: number;
    };
    return {
      ...obj,
      customerId: populatedCustomer._id,
      customer: {
        id: populatedCustomer._id,
        name: populatedCustomer.name,
        profilePhoto: populatedCustomer.profilePhoto,
        ratingAvg: populatedCustomer.ratingAvg,
        ratingCount: populatedCustomer.ratingCount,
      },
    };
  });

  res.status(200).json({ bookings: withCustomer });
});
