import { Schema, model, Types } from 'mongoose';

/**
 * P1.2 — one weekly demand check for one district or one society, kept
 * whether or not it paid anything: the record of "demand was normal, so
 * nobody was paid" is as much a part of the rule as a payout is.
 */
export type WelfareScope = 'district' | 'society';

export interface IWelfareCheck {
  _id: Types.ObjectId;
  scope: WelfareScope;
  /** The district Federation or the Mutha. */
  scopeId: Types.ObjectId;
  scopeName: string;
  region?: string;
  /** The district pool payouts come from (absent when the scope has none). */
  poolFederationId?: Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  dryRun: boolean;
  activeMembers: number;
  completedBookings: number;
  perActiveMember: number | null;
  trailingMedian: number | null;
  historyWeeks: number;
  demandIndex: number | null;
  /** Why no index or no payout, in words (e.g. "not enough history"). */
  note?: string;
  triggered: boolean;
  poolBalanceBefore: number;
  budget: number;
  paidTotal: number;
  killSwitchOff: boolean;
  payouts: { userId: Types.ObjectId; activeDays: number; amount: number; payoutId?: Types.ObjectId }[];
  createdAt: Date;
}

const welfareCheckSchema = new Schema<IWelfareCheck>(
  {
    scope: { type: String, enum: ['district', 'society'], required: true },
    scopeId: { type: Schema.Types.ObjectId, required: true },
    scopeName: { type: String, required: true },
    region: { type: String },
    poolFederationId: { type: Schema.Types.ObjectId, ref: 'Federation' },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    dryRun: { type: Boolean, default: false },
    activeMembers: { type: Number, default: 0 },
    completedBookings: { type: Number, default: 0 },
    perActiveMember: { type: Number, default: null },
    trailingMedian: { type: Number, default: null },
    historyWeeks: { type: Number, default: 0 },
    demandIndex: { type: Number, default: null },
    note: { type: String },
    triggered: { type: Boolean, default: false },
    poolBalanceBefore: { type: Number, default: 0 },
    budget: { type: Number, default: 0 },
    paidTotal: { type: Number, default: 0 },
    killSwitchOff: { type: Boolean, default: false },
    payouts: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          activeDays: { type: Number, required: true },
          amount: { type: Number, required: true },
          payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
        },
      ],
      default: [],
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Idempotent per period: one real (non-dry-run) check per scope per week.
welfareCheckSchema.index(
  { scope: 1, scopeId: 1, periodStart: 1 },
  { unique: true, partialFilterExpression: { dryRun: false } }
);
welfareCheckSchema.index({ poolFederationId: 1, periodStart: -1 });

export const WelfareCheck = model<IWelfareCheck>('WelfareCheck', welfareCheckSchema);
