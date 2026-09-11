import { Schema, model, Types } from 'mongoose';

/**
 * A "rate later" on one completed booking.
 *
 * The rating gate (ratingGate.service.ts) blocks a member from booking again
 * — or a worker from accepting again — until they have rated their last
 * completed job. That keeps rating coverage high, which is the point, but on
 * its own it is a hard wall: a customer standing in front of a broken tap
 * cannot book a plumber until they deal with unrelated admin, and the screen
 * that told them so had no way to act on it.
 *
 * A deferral is the pressure valve. It does not mark the booking rated and
 * it does not delete the prompt — the job stays in the pending-ratings list
 * and can still be rated at any time. It only stops that one booking from
 * blocking the gate, and only for a window, after which it asks again.
 *
 * Deliberately a separate collection rather than a flag on Booking: a
 * deferral is per-person (the customer and the worker each rate the same
 * booking independently), and keeping it separate means the Booking document
 * is untouched by it.
 */
export interface IRatingDeferral {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  userId: Types.ObjectId;
  /** When the gate starts asking about this booking again. */
  remindAt: Date;
  createdAt: Date;
}

/** How long a "rate later" holds before the prompt returns. */
export const RATING_DEFERRAL_HOURS = 24;

const ratingDeferralSchema = new Schema<IRatingDeferral>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    remindAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One deferral per person per booking — deferring again just moves the date
// (see rating.controller.ts's deferRating, which upserts).
ratingDeferralSchema.index({ bookingId: 1, userId: 1 }, { unique: true });
ratingDeferralSchema.index({ userId: 1, remindAt: 1 });

export const RatingDeferral = model<IRatingDeferral>('RatingDeferral', ratingDeferralSchema);
