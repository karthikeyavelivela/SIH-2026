import { Schema, model, Types } from 'mongoose';

export type InsurancePolicyStatus = 'active' | 'expired' | 'cancelled';

// A specific worker's actual coverage — instance of a catalog InsurancePlan.
export interface IInsurancePolicy {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  status: InsurancePolicyStatus;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

const insurancePolicySchema = new Schema<IInsurancePolicy>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: Schema.Types.ObjectId, ref: 'InsurancePlan', required: true },
    status: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
    startDate: { type: Date, required: true, default: Date.now },
    endDate: { type: Date, required: true },
  },
  { timestamps: true }
);

insurancePolicySchema.index({ userId: 1, status: 1 });

export const InsurancePolicy = model<IInsurancePolicy>('InsurancePolicy', insurancePolicySchema);
