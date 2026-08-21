import { Booking, IBooking } from '../models/Booking';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import { ApiError } from '../utils/ApiError';
import { findUnratedCompletedBooking } from './ratingGate.service';

/**
 * Mandatory-rating gate (spec: "mandatory before either can start a new
 * booking/accept a new job"), enforced HERE rather than only at the REST
 * controller layer, so it applies uniformly regardless of which channel
 * triggers an accept — a worker responding to a Phase 3 pushed offer over
 * the socket goes through this exact same function and cannot bypass the
 * gate that the REST browse-mode path also hits.
 */
async function assertNoUnratedCompletedBooking(userId: string, message: string): Promise<void> {
  const unratedBookingId = await findUnratedCompletedBooking(userId);
  if (unratedBookingId) {
    throw new ApiError(403, message, { unratedBookingId });
  }
}

const openStatus = { $in: ['requested', 'searching'] };

/**
 * The atomic accept core, shared by two callers: the REST
 * POST /api/requests/:id/accept endpoint (a worker browsing the open list)
 * and the Phase 3 offer engine (a worker responding to a pushed exclusive
 * offer). Both paths converge here so there is exactly one place that
 * performs the $expr-guarded atomic write — a booking can never be
 * double-assigned regardless of which channel won the race.
 *
 * status flips straight from requested/searching to 'accepted' the instant
 * every required slot is filled — see the note on this in the original
 * Phase 2 requests controller; Phase 3 doesn't change that, it only changes
 * how a worker was told about the booking (pushed exclusive offer vs.
 * browsing an open list), not the assignment write itself.
 */
async function maybeAdvanceToAccepted(bookingId: string): Promise<void> {
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

export async function acceptAsDriver(userId: string, bookingId: string): Promise<IBooking> {
  await assertNoUnratedCompletedBooking(userId, 'Please rate your last completed job before accepting a new one');
  const vehicle = await Vehicle.findOne({ ownerId: userId });
  if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
  if (vehicle.availabilityStatus !== 'online') throw new ApiError(400, 'Go online before accepting a job');
  // Authoritative accept-time gate — the offer engine and browse list
  // (Section 1.1 of the remediation build) already hide non-compliant
  // vehicles' jobs, but this is the check that actually matters: it closes
  // the race where a client's stale list still shows a job that became
  // hidden after the vehicle failed a fresh inspection mid-poll.
  if (vehicle.complianceStatus === 'non_compliant') {
    throw new ApiError(400, 'This vehicle failed its last compliance inspection — get it re-inspected before accepting jobs');
  }

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
  if (!booking) throw new ApiError(409, 'This job is no longer available');

  await Vehicle.updateOne({ _id: vehicle._id }, { availabilityStatus: 'on_job' });
  await maybeAdvanceToAccepted(booking._id.toString());
  return (await Booking.findById(booking._id))!;
}

export async function acceptAsHamaliSolo(userId: string, bookingId: string): Promise<IBooking> {
  await assertNoUnratedCompletedBooking(userId, 'Please rate your last completed job before accepting a new one');
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
  await maybeAdvanceToAccepted(booking._id.toString());
  return (await Booking.findById(booking._id))!;
}

export async function acceptAsMuthaLeader(
  userId: string,
  bookingId: string,
  memberIds: string[]
): Promise<IBooking> {
  await assertNoUnratedCompletedBooking(userId, 'Please rate your last completed job before accepting a new one');
  const mutha = await Mutha.findOne({ leaderId: userId });
  if (!mutha) throw new ApiError(404, 'No Mutha found for this leader');
  if (memberIds.length === 0) throw new ApiError(400, 'memberIds is required to assign members to this job');

  const myMemberIds = new Set(mutha.memberIds.map((id) => id.toString()));
  for (const id of memberIds) {
    if (!myMemberIds.has(id)) throw new ApiError(403, `${id} is not a member of your Mutha`);
  }

  const profiles = await HamaliProfile.find({ userId: { $in: memberIds }, type: 'mutha_member', muthaId: mutha._id });
  if (profiles.length !== memberIds.length) {
    throw new ApiError(400, 'One or more members do not have a valid Hamali profile in this Mutha');
  }
  if (profiles.some((p) => p.availabilityStatus !== 'online')) {
    throw new ApiError(400, 'One or more selected members are not online/available');
  }

  const booking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      status: openStatus,
      type: { $in: ['hamali', 'combo'] },
      $expr: {
        $lte: [{ $add: [{ $size: '$assignedHamaliIds' }, memberIds.length] }, '$requiredHamaliCount'],
      },
    },
    { $push: { assignedHamaliIds: { $each: memberIds } }, $set: { assignedMuthaId: mutha._id } },
    { new: true }
  );
  if (!booking) throw new ApiError(409, 'This job no longer has room for that many members');

  await HamaliProfile.updateMany({ userId: { $in: memberIds } }, { availabilityStatus: 'on_job' });
  await maybeAdvanceToAccepted(booking._id.toString());
  return (await Booking.findById(booking._id))!;
}

export async function rejectBooking(userId: string, bookingId: string): Promise<IBooking> {
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: openStatus },
    { $addToSet: { rejectedByUserIds: userId } },
    { new: true }
  );
  if (!booking) throw new ApiError(404, 'Booking not found or no longer open');
  return booking;
}
