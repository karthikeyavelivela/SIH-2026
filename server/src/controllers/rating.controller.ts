import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Rating } from '../models/Rating';
import { RatingDeferral, RATING_DEFERRAL_HOURS } from '../models/RatingDeferral';
import { Mutha } from '../models/Mutha';
import { applyRatingToUser, applyRatingToMutha } from '../services/rating.service';
import { rethrowAsConflict } from '../utils/mongoErrors';

interface RatingTarget {
  toUserId?: string;
  toMuthaId?: string;
}

/**
 * The rating's target is always DERIVED server-side from the booking's
 * real assignment, never taken from the request body — a client could
 * otherwise inflate/sabotage an arbitrary user's rating by claiming to be
 * party to a booking it wasn't. One rating per (booking, rater) — for a
 * combo booking with both a driver and hamali/Mutha side, the customer's
 * single rating targets the Mutha if one is assigned, else the driver,
 * else the hamali crew's first member. This is a deliberate Phase 4
 * simplification (documented, not silently picked) — splitting one
 * combo booking's rating across multiple independently-rated components
 * isn't specified by the build spec and would need its own uniqueness
 * model (bookingId+toUserId, not just bookingId).
 */
async function determineRatingTarget(booking: IBooking, fromUserId: string, fromRole: string): Promise<RatingTarget> {
  const isCustomer = booking.customerId.toString() === fromUserId;
  if (isCustomer) {
    if (booking.assignedMuthaId) return { toMuthaId: booking.assignedMuthaId.toString() };
    if (booking.assignedDriverIds.length > 0) return { toUserId: booking.assignedDriverIds[0].toString() };
    if (booking.assignedHamaliIds.length > 0) return { toUserId: booking.assignedHamaliIds[0].toString() };
    throw new ApiError(400, 'This booking has nobody assigned to rate');
  }

  const isAssignedWorker =
    booking.assignedDriverIds.some((id) => id.toString() === fromUserId) ||
    booking.assignedHamaliIds.some((id) => id.toString() === fromUserId);
  if (isAssignedWorker) return { toUserId: booking.customerId.toString() };

  if (fromRole === 'mutha_leader') {
    const mutha = await Mutha.findOne({ leaderId: fromUserId }).select('_id').lean();
    if (mutha && booking.assignedMuthaId?.toString() === mutha._id.toString()) {
      return { toUserId: booking.customerId.toString() };
    }
  }

  throw new ApiError(403, 'You were not a party to this booking');
}

export const submitRating = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, score, comment } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'completed') throw new ApiError(400, 'Can only rate a completed booking');

  const target = await determineRatingTarget(booking, req.user!.id, req.user!.role);

  let rating;
  try {
    rating = await Rating.create({
      bookingId: booking._id,
      fromUserId: req.user!.id,
      toUserId: target.toUserId,
      toMuthaId: target.toMuthaId,
      score,
      comment,
    });
  } catch (err) {
    rethrowAsConflict(err, 'A rating for this booking from you');
  }

  if (target.toUserId) await applyRatingToUser(target.toUserId, score);
  if (target.toMuthaId) await applyRatingToMutha(target.toMuthaId, score);

  res.status(201).json({ rating });
});

/** GET /api/ratings/pending — the caller's own unrated-completed-booking gate state, so the client can prompt proactively instead of only discovering it via a 403 on their next action. */
export const getPendingRating = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { findUnratedCompletedBooking } = await import('../services/ratingGate.service');

  // `bookingId` stays exactly what it was — the one booking currently
  // holding the gate, or null — so existing callers are unaffected.
  const bookingId = await findUnratedCompletedBooking(userId);

  // `pending` is the full list, deferred jobs included, so a member can see
  // and clear everything they owe rather than being handed one id at a time
  // with no way to find the rest.
  const completed = await Booking.find({
    status: 'completed',
    $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }],
  })
    .select('_id serviceType type pickupAddress dropAddress fareBreakdown.total completedAt updatedAt')
    .sort({ updatedAt: -1 })
    .lean();

  const ratedIds = new Set(
    (await Rating.find({ fromUserId: userId, bookingId: { $in: completed.map((b) => b._id) } })
      .select('bookingId')
      .lean()
    ).map((r) => r.bookingId.toString())
  );

  const deferrals = new Map(
    (await RatingDeferral.find({ userId, bookingId: { $in: completed.map((b) => b._id) } })
      .select('bookingId remindAt')
      .lean()
    ).map((d) => [d.bookingId.toString(), d.remindAt])
  );

  const pending = completed
    .filter((b) => !ratedIds.has(b._id.toString()))
    .map((b) => ({ ...b, deferredUntil: deferrals.get(b._id.toString()) ?? null }));

  res.status(200).json({ bookingId, pending });
});

/**
 * POST /api/ratings/:bookingId/defer — "rate later".
 *
 * Does not mark the booking rated and does not remove it from the pending
 * list; it only stops that booking holding the rating gate for a window, so
 * a member with a job to book is not walled off by unrelated admin. Deferring
 * again just moves the reminder.
 */
export const deferRating = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { bookingId } = req.params;

  const booking = await Booking.findById(bookingId).select('status customerId assignedDriverIds assignedHamaliIds').lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'completed') throw new ApiError(400, 'Only a completed booking can be rated later');

  // Only a party to the booking may defer its rating.
  const parties = [
    booking.customerId?.toString(),
    ...(booking.assignedDriverIds ?? []).map((d) => d.toString()),
    ...(booking.assignedHamaliIds ?? []).map((h) => h.toString()),
  ].filter(Boolean);
  if (!parties.includes(userId)) throw new ApiError(403, 'You were not part of this booking');

  const alreadyRated = await Rating.exists({ fromUserId: userId, bookingId });
  if (alreadyRated) throw new ApiError(400, 'You have already rated this booking');

  const remindAt = new Date(Date.now() + RATING_DEFERRAL_HOURS * 60 * 60 * 1000);
  const deferral = await RatingDeferral.findOneAndUpdate(
    { bookingId, userId },
    { bookingId, userId, remindAt },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ deferral });
});

/**
 * GET /api/ratings/mine — ratings RECEIVED by the caller, for the Phase 2
 * profile page's "Trust" section: the 1-5 star distribution plus the most
 * recent comments. Real aggregate against Rating, not the User.ratingAvg/
 * ratingCount summary alone (which has no distribution or comment text).
 */
export const getMyRatings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;

  const [distributionAgg, recent] = await Promise.all([
    Rating.aggregate([
      { $match: { toUserId: new Types.ObjectId(userId) } },
      { $group: { _id: '$score', count: { $sum: 1 } } },
    ]),
    Rating.find({ toUserId: userId, comment: { $exists: true, $ne: '' } })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('score comment createdAt bookingId')
      .lean(),
  ]);

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distributionAgg) distribution[row._id] = row.count;

  res.status(200).json({ distribution, recentComments: recent });
});
