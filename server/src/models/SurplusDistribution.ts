import { Schema, model, Types } from 'mongoose';

// SIH26089 Phase B.2 — a real cooperative returns its operating surplus to
// members rather than extracting it as private profit. This is that
// mechanism: a periodic computation of a Society's retained
// commission+welfare-fund income over a window, split proportionally by
// each member's real MemberShare.shareCount, and (once approved) posted as
// real negative 'surplus' LedgerEntry rows per member — see
// governance.service.ts's computeSurplus/distributeSurplus.
export type SurplusDistributionStatus = 'computed' | 'distributed';

export interface ISurplusDistributionLineItem {
  userId: Types.ObjectId;
  shareCount: number;
  amount: number;
}

export interface ISurplusDistribution {
  _id: Types.ObjectId;
  muthaId: Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  totalSurplus: number;
  perShareAmount: number;
  lineItems: ISurplusDistributionLineItem[];
  status: SurplusDistributionStatus;
  computedAt: Date;
  distributedAt?: Date;
  distributedByUserId?: Types.ObjectId;
}

const surplusDistributionSchema = new Schema<ISurplusDistribution>({
  muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha', required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  totalSurplus: { type: Number, required: true, min: 0 },
  perShareAmount: { type: Number, required: true, min: 0 },
  lineItems: {
    type: [
      {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        shareCount: { type: Number, required: true },
        amount: { type: Number, required: true },
      },
    ],
    default: [],
  },
  status: { type: String, enum: ['computed', 'distributed'], default: 'computed' },
  computedAt: { type: Date, default: Date.now },
  distributedAt: { type: Date },
  distributedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
});

surplusDistributionSchema.index({ muthaId: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

export const SurplusDistribution = model<ISurplusDistribution>('SurplusDistribution', surplusDistributionSchema);
