import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import { findCandidateMuthas } from '../services/matching.service';

// Phase 2 polling scope: a single fixed search radius, not the spec's real
// "start small, widen if no response" expanding search — that behavior is
// meaningfully tied to the sequential-timed-offer flow (Phase 3, sockets),
// where "no response" is an observable event. Polling has no such signal
// to widen on, so a single generous radius is the honest Phase 2 stand-in.
const SEARCH_RADIUS_KM = 25;

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

/**
 * status flips from requested/searching straight to 'accepted' the moment
 * every required slot (vehicle and/or hamali headcount) is filled — Phase 2
 * has no real-time customer confirmation step to insert a separate
 * 'matched' pause at (that's what Phase 3's booking:matched/booking:confirm
 * socket exchange formalizes). Collapsing the two here is a deliberate,
 * documented simplification, not an oversight.
 */
async function maybeAdvanceToAccepted(bookingId: Types.ObjectId): Promise<void> {
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (!['requested', 'searching'].includes(booking.status)) return;

  const needsVehicle = booking.type === 'truck' || booking.type === 'combo';
  const needsHamali = booking.type === 'hamali' || booking.type === 'combo';
  const vehicleFulfilled = !needsVehicle || booking.assignedDriverIds.length >= 1;
  const hamaliFulfilled = !needsHamali || booking.assignedHamaliIds.length >= booking.requiredHamaliCount;

  if (vehicleFulfilled && hamaliFulfilled) {
    booking.status = 'accepted';
    booking.statusHistory.push({ status: 'accepted', timestamp: new Date() });
    await booking.save();
  }
}

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
    const bookings = await Booking.find({
      status: openStatus,
      type: { $in: ['truck', 'combo'] },
      assignedDriverIds: { $size: 0 },
      rejectedByUserIds: { $ne: userId },
      'requiredVehicles.0.capacityKg': { $lte: vehicle.capacityKg },
      pickupLocation: {
        $near: { $geometry: vehicle.currentLocation, $maxDistance: SEARCH_RADIUS_KM * 1000 },
      },
    }).limit(20);
    res.status(200).json({ requests: bookings });
    return;
  }

  if (role === 'hamali_solo') {
    const profile = await HamaliProfile.findOne({ userId, type: 'solo' });
    if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
    if (profile.availabilityStatus !== 'online') {
      res.status(200).json({ requests: [] });
      return;
    }
    const bookings = await Booking.find({
      status: openStatus,
      type: { $in: ['hamali', 'combo'] },
      rejectedByUserIds: { $ne: userId },
      $expr: { $lt: [{ $size: '$assignedHamaliIds' }, '$requiredHamaliCount'] },
      pickupLocation: {
        $near: { $geometry: profile.currentLocation, $maxDistance: SEARCH_RADIUS_KM * 1000 },
      },
    }).limit(20);
    res.status(200).json({ requests: bookings });
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

  if (role === 'driver') {
    const vehicle = await Vehicle.findOne({ ownerId: userId });
    if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
    if (vehicle.availabilityStatus !== 'online') throw new ApiError(400, 'Go online before accepting a job');

    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: openStatus,
        type: { $in: ['truck', 'combo'] },
        assignedDriverIds: { $size: 0 },
        'requiredVehicles.0.capacityKg': { $lte: vehicle.capacityKg },
      },
      { $push: { assignedDriverIds: userId } },
      { new: true }
    );
    // A null result is ambiguous by design (already taken vs. never
    // existed vs. capacity mismatch) — 409 is deliberately generic rather
    // than leaking which, since distinguishing them would mean running the
    // same query again just to explain a race that's already lost.
    if (!booking) throw new ApiError(409, 'This job is no longer available');

    await Vehicle.updateOne({ _id: vehicle._id }, { availabilityStatus: 'on_job' });
    await maybeAdvanceToAccepted(booking._id);
    res.status(200).json({ booking: await Booking.findById(booking._id) });
    return;
  }

  if (role === 'hamali_solo') {
    const profile = await HamaliProfile.findOne({ userId, type: 'solo' });
    if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
    if (profile.availabilityStatus !== 'online') throw new ApiError(400, 'Go online before accepting a job');

    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: openStatus,
        type: { $in: ['hamali', 'combo'] },
        $expr: { $lt: [{ $size: '$assignedHamaliIds' }, '$requiredHamaliCount'] },
      },
      { $push: { assignedHamaliIds: userId } },
      { new: true }
    );
    if (!booking) throw new ApiError(409, 'This job is no longer available');

    await HamaliProfile.updateOne({ _id: profile._id }, { availabilityStatus: 'on_job' });
    await maybeAdvanceToAccepted(booking._id);
    res.status(200).json({ booking: await Booking.findById(booking._id) });
    return;
  }

  if (role === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: userId });
    if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');

    const memberIds: string[] = Array.isArray(req.body.memberIds) ? req.body.memberIds : [];
    if (memberIds.length === 0) throw new ApiError(400, 'memberIds is required to assign members to this job');

    const myMemberIds = new Set(mutha.memberIds.map((id) => id.toString()));
    for (const id of memberIds) {
      if (!myMemberIds.has(id)) throw new ApiError(403, `${id} is not a member of your Mutha`);
    }

    const profiles = await HamaliProfile.find({
      userId: { $in: memberIds },
      type: 'mutha_member',
      muthaId: mutha._id,
    });
    if (profiles.length !== memberIds.length) {
      throw new ApiError(400, 'One or more members do not have a valid Hamali profile in this Mutha');
    }
    const notOnline = profiles.filter((p) => p.availabilityStatus !== 'online');
    if (notOnline.length > 0) {
      throw new ApiError(400, 'One or more selected members are not online/available');
    }

    // $expr guard re-checks remaining capacity at write time (not just at
    // the read above) — this is what makes the accept atomic against a
    // second leader/solo hamali racing to fill the same remaining slots.
    const booking = await Booking.findOneAndUpdate(
      {
        _id: bookingId,
        status: openStatus,
        type: { $in: ['hamali', 'combo'] },
        $expr: {
          $lte: [{ $add: [{ $size: '$assignedHamaliIds' }, memberIds.length] }, '$requiredHamaliCount'],
        },
      },
      {
        $push: { assignedHamaliIds: { $each: memberIds } },
        $set: { assignedMuthaId: mutha._id },
      },
      { new: true }
    );
    if (!booking) throw new ApiError(409, 'This job no longer has room for that many members');

    await HamaliProfile.updateMany({ userId: { $in: memberIds } }, { availabilityStatus: 'on_job' });
    await maybeAdvanceToAccepted(booking._id);
    res.status(200).json({ booking: await Booking.findById(booking._id) });
    return;
  }

  throw new ApiError(403, 'This role does not receive job requests');
});

// ---- POST /api/requests/:id/reject ----

export const rejectRequest = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  if (!['driver', 'hamali_solo', 'mutha_leader'].includes(role)) {
    throw new ApiError(403, 'This role does not receive job requests');
  }
  // Idempotent — $addToSet, not $push, so rejecting twice (e.g. a retried
  // request) doesn't grow rejectedByUserIds unboundedly.
  const booking = await Booking.findOneAndUpdate(
    { _id: req.params.id, status: openStatus },
    { $addToSet: { rejectedByUserIds: userId } },
    { new: true }
  );
  if (!booking) throw new ApiError(404, 'Booking not found or no longer open');
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

  const bookings = await Booking.find(filter).sort({ createdAt: -1 }).limit(100);
  res.status(200).json({ bookings });
});
