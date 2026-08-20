import { Schema, model, Types } from 'mongoose';

export type PayoutStatus = 'pending' | 'approved' | 'rejected' | 'paid';

// Lightweight payout-approval queue (driver/hamali/Mutha earnings cycle
// close). Distinct from Incentive (a bonus grant) and Payment (a customer
// -> platform charge) — this is platform -> worker.
export interface IPayout {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  amount: number;
  period: string; // e.g. '2026-08'
  status: PayoutStatus;
  breakdown: Record<string, number>;
  decidedByAdminId?: Types.ObjectId;
  decidedAt?: Date;
  createdAt: Date;
}

const payoutSchema = new Schema<IPayout>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0 },
    period: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending' },
    breakdown: { type: Schema.Types.Mixed, default: {} },
    decidedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

payoutSchema.index({ status: 1, createdAt: -1 });

export const Payout = model<IPayout>('Payout', payoutSchema);
