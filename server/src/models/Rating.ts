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
    comment: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Rating = model<IRating>('Rating', ratingSchema);
