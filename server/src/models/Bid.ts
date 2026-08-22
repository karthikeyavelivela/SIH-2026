import { Schema, model, Types } from 'mongoose';

export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface IBid {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  bidderId: Types.ObjectId;
  bidderRole: 'driver' | 'hamali_solo';
  amount: number;
  message?: string;
  status: BidStatus;
  createdAt: Date;
  updatedAt: Date;
}

const bidSchema = new Schema<IBid>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    bidderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bidderRole: { type: String, enum: ['driver', 'hamali_solo'], required: true },
    amount: { type: Number, required: true, min: 1 },
    message: { type: String, maxlength: 300 },
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn'], default: 'pending' },
  },
  { timestamps: true }
);

bidSchema.index({ bookingId: 1, status: 1 });
// Partial (only `status:'pending'` rows constrained) rather than a plain
// unique index — a bidder who withdrew or lost a bid can place a fresh one
// later (a new document, status 'pending' again); this only ever blocks
// having TWO simultaneously-active bids from the same bidder on the same
// booking, same "at most one active X" pattern as FareRule's own partial
// unique index.
bidSchema.index({ bookingId: 1, bidderId: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

export const Bid = model<IBid>('Bid', bidSchema);
