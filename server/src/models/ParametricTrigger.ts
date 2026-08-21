import { Schema, model, Types } from 'mongoose';

export type ParametricCondition = 'earnings_below_threshold' | 'days_unable_to_work';

/**
 * One evaluation of a ParametricTrigger's rule, recorded so a worker can see
 * trigger history and so the service can tell "already handled this period"
 * from "not checked yet" — the idempotency record. Embedded (not a separate
 * collection) since events are only ever read/written scoped to their parent
 * trigger, per document — no cross-trigger query ever needed.
 *
 * `periodIndex` is the idempotency key: `floor(checkedAt.getTime() /
 * (periodDays * 86400000))`, an epoch-aligned bucket number. Two checks that
 * fall in the same bucket for the same trigger always reuse the same event
 * (see parametricInsurance.service.ts) — the payout for a given policy+period
 * is created at most once, no matter how many times the check runs.
 */
export interface IParametricTriggerEvent {
  checkedAt: Date;
  periodIndex: number;
  periodStart: Date;
  periodEnd: Date;
  actualValue: number;
  triggered: boolean;
  paidAt?: Date;
  // Added for AUDIT_REPORT.md Phase 1.4 — previously `paidAt` was set on a
  // trigger firing with no real money moving (no Payout, no LedgerEntry).
  // `payoutId` is the real Payout this event actually produced — present
  // whenever `triggered` is true, whether it ended up 'paid' automatically
  // or 'pending' in the admin queue (see payoutFailureReason). Absent only
  // when `triggered` is false (nothing to pay).
  payoutId?: Types.ObjectId;
  // Set when a fired trigger could NOT be auto-paid (kill switch off, a
  // cap breached, or the disbursement write failed after retries) — the
  // Payout is still created, just 'pending' in the ordinary admin queue
  // instead of already 'paid'. Absent when auto-payment succeeded.
  payoutFailureReason?: string;
}

export interface IParametricTrigger {
  _id: Types.ObjectId;
  policyId: Types.ObjectId;
  condition: ParametricCondition;
  thresholdValue: number;
  periodDays: number;
  payoutAmount: number;
  active: boolean;
  events: IParametricTriggerEvent[];
  createdAt: Date;
  updatedAt: Date;
}

const parametricTriggerEventSchema = new Schema<IParametricTriggerEvent>(
  {
    checkedAt: { type: Date, required: true, default: Date.now },
    periodIndex: { type: Number, required: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    actualValue: { type: Number, required: true },
    triggered: { type: Boolean, required: true },
    paidAt: { type: Date },
    payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
    payoutFailureReason: { type: String, trim: true },
  },
  { _id: false }
);

const parametricTriggerSchema = new Schema<IParametricTrigger>(
  {
    policyId: { type: Schema.Types.ObjectId, ref: 'InsurancePolicy', required: true },
    condition: { type: String, enum: ['earnings_below_threshold', 'days_unable_to_work'], required: true },
    thresholdValue: { type: Number, required: true, min: 0 },
    periodDays: { type: Number, required: true, min: 1, default: 30 },
    payoutAmount: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true },
    events: { type: [parametricTriggerEventSchema], default: [] },
  },
  { timestamps: true }
);

parametricTriggerSchema.index({ policyId: 1 });

export const ParametricTrigger = model<IParametricTrigger>('ParametricTrigger', parametricTriggerSchema);
