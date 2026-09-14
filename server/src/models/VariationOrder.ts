import { Schema, model, Types } from 'mongoose';

/**
 * A change to the scope of an accepted quotation.
 *
 * This exists so that "the price went up because we found more work" can
 * never happen silently. An accepted quotation's total is frozen; the ONLY
 * way the amount a customer owes can move is a document like this one, which
 * starts life as a request and does nothing at all until the customer
 * approves it.
 *
 * It is a separate collection rather than a field on the quotation for a
 * reason worth stating: a variation is its own agreement, with its own
 * description, its own amount and its own moment of consent. Folding it into
 * the quotation would make "what did I agree to, and when" unanswerable — the
 * exact question that gets asked when a final bill surprises somebody.
 */

export type VariationStatus = 'requested' | 'approved' | 'rejected';

export interface IVariationOrder {
  _id: Types.ObjectId;
  quotationId: Types.ObjectId;
  bookingId?: Types.ObjectId;
  requestedByWorkerId: Types.ObjectId;
  customerId: Types.ObjectId;
  description: string;
  /** May be negative — work that turned out to be unnecessary reduces the bill. */
  amount: number;
  status: VariationStatus;
  requestedAt: Date;
  customerApprovedAt?: Date;
  rejectedAt?: Date;
  customerNote?: string;
}

const variationOrderSchema = new Schema<IVariationOrder>(
  {
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    requestedByWorkerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    description: { type: String, required: true, maxlength: 1000 },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['requested', 'approved', 'rejected'], default: 'requested' },
    requestedAt: { type: Date, default: Date.now },
    customerApprovedAt: { type: Date },
    rejectedAt: { type: Date },
    customerNote: { type: String, maxlength: 500 },
  },
  { timestamps: false }
);

export const VariationOrder = model<IVariationOrder>('VariationOrder', variationOrderSchema);
