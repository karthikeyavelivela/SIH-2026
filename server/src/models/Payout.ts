import { Schema, model, Types } from 'mongoose';

export type PayoutStatus = 'pending' | 'approved' | 'rejected' | 'paid';
export type PayoutSource = 'earnings' | 'parametric_insurance';

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
  // Added for AUDIT_REPORT.md Phase 1.4/1.5 — distinguishes a regular
  // trailing-earnings payout (Phase 1.5's payoutGeneration.service.ts,
  // always created 'pending' for admin approval) from an automatic
  // parametric-insurance disbursement (parametricInsurance.service.ts,
  // created already 'paid' when caps/kill-switch allow it, or 'pending' —
  // falling into the same admin queue — when they don't). `sourceRefId`
  // points at the ParametricTrigger for the latter, absent for the former.
  source: PayoutSource;
  sourceRefId?: Types.ObjectId;
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
    source: { type: String, enum: ['earnings', 'parametric_insurance'], required: true, default: 'earnings' },
    sourceRefId: { type: Schema.Types.ObjectId },
    decidedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

payoutSchema.index({ status: 1, createdAt: -1 });
payoutSchema.index({ userId: 1, source: 1, status: 1, createdAt: -1 });

export const Payout = model<IPayout>('Payout', payoutSchema);
