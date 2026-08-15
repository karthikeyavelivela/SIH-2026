import { Schema, model, Types } from 'mongoose';

export interface IRating {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  fromUserId: Types.ObjectId;
  toUserId?: Types.ObjectId;
  toMuthaId?: Types.ObjectId;
  score: number;
  comment?: string;
  createdAt: Date;
}

const ratingSchema = new Schema<IRating>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    fromUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    toMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    score: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One rating per (booking, rater) — the "mandatory before next booking/job"
// gate (ratingGate.service.ts) relies on this being unique to know a
// booking is settled the moment a Rating exists for that pair.
ratingSchema.index({ bookingId: 1, fromUserId: 1 }, { unique: true });

export const Rating = model<IRating>('Rating', ratingSchema);
