import { Schema, model, Types } from 'mongoose';

/**
 * P1.2 — a district's welfare pool. The balance is never stored here: it is
 * always read from the ledger (welfare_pool_contribution in, minus
 * welfare_pool_payout out) by welfarePool.service.ts, so it cannot drift
 * from the money actually posted. This row only names the pool and records
 * when it was last checked.
 */
export interface IWelfarePool {
  _id: Types.ObjectId;
  districtFederationId: Types.ObjectId;
  region: string;
  lastCheckedAt?: Date;
  createdAt: Date;
}

const welfarePoolSchema = new Schema<IWelfarePool>(
  {
    districtFederationId: { type: Schema.Types.ObjectId, ref: 'Federation', required: true, unique: true },
    region: { type: String, required: true },
    lastCheckedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const WelfarePool = model<IWelfarePool>('WelfarePool', welfarePoolSchema);
