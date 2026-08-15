import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking, IBooking } from '../models/Booking';
import { Rating } from '../models/Rating';
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
  const { findUnratedCompletedBooking } = await import('../services/ratingGate.service');
  const bookingId = await findUnratedCompletedBooking(req.user!.id);
  res.status(200).json({ bookingId });
});
