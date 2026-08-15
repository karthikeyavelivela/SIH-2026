import { Schema, model, Types } from 'mongoose';

// Not in the original spec's Data Models list — only Incentive (a GRANT
// record) is defined there. Spec text says "threshold rules configurable
// by Admin", which needs somewhere to actually store a rule; documented
// here the same way ChatMessage/IncentiveRule additions elsewhere in this
// codebase are.
export interface IIncentiveRule {
  _id: Types.ObjectId;
  minRatingAvg: number;
  minCompletedJobs: number;
  bonusAmount: number;
  region?: string;
  active: boolean;
  createdByAdminId: Types.ObjectId;
  createdAt: Date;
}

const incentiveRuleSchema = new Schema<IIncentiveRule>(
  {
    minRatingAvg: { type: Number, required: true, min: 0, max: 5 },
    minCompletedJobs: { type: Number, required: true, min: 0 },
    bonusAmount: { type: Number, required: true, min: 0 },
    region: { type: String, trim: true },
    active: { type: Boolean, default: true },
    createdByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const IncentiveRule = model<IIncentiveRule>('IncentiveRule', incentiveRuleSchema);
