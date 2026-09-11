import { Booking } from '../models/Booking';
import { Rating } from '../models/Rating';
import { RatingDeferral } from '../models/RatingDeferral';

/**
 * Spec: "both sides are prompted to submit a Rating (mandatory before
 * either can start a new booking/accept a new job, to keep rating
 * coverage high)". Returns the first completed booking (if any) that this
 * user was a party to (as customer, or as an assigned driver/hamali) and
 * has not yet rated — the caller (createBooking / acceptRequest) blocks
 * on a non-null result.
 */
export async function findUnratedCompletedBooking(userId: string): Promise<string | null> {
  const completedBookingIds = await Booking.find({
    status: 'completed',
    $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }],
  })
    .select('_id')
    .lean();

  if (completedBookingIds.length === 0) return null;

  const ratedBookingIds = new Set(
    (await Rating.find({ fromUserId: userId, bookingId: { $in: completedBookingIds.map((b) => b._id) } })
      .select('bookingId')
      .lean()
    ).map((r) => r.bookingId.toString())
  );

  // A booking the user chose to rate later does not hold the gate until its
  // reminder falls due. It stays unrated and stays in the pending list —
  // this only stops it blocking a new booking in the meantime.
  const deferredBookingIds = new Set(
    (
      await RatingDeferral.find({
        userId,
        bookingId: { $in: completedBookingIds.map((b) => b._id) },
        remindAt: { $gt: new Date() },
      })
        .select('bookingId')
        .lean()
    ).map((d) => d.bookingId.toString())
  );

  const unrated = completedBookingIds.find(
    (b) => !ratedBookingIds.has(b._id.toString()) && !deferredBookingIds.has(b._id.toString())
  );
  return unrated ? unrated._id.toString() : null;
}
