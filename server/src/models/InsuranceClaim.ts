import { Schema, model, Types } from 'mongoose';

export type InsuranceClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid';

// The standard (non-parametric) claims path: a worker reports an incident
// against one of their own active policies and an admin/manager reviews it.
export interface IInsuranceClaim {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  policyId: Types.ObjectId;
  incidentDescription: string;
  incidentDate: Date;
  status: InsuranceClaimStatus;
  payoutAmount: number;
  photos: string[];
  reviewedByUserId?: Types.ObjectId;
  reviewNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const insuranceClaimSchema = new Schema<IInsuranceClaim>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    policyId: { type: Schema.Types.ObjectId, ref: 'InsurancePolicy', required: true },
    incidentDescription: { type: String, required: true, trim: true },
    incidentDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['submitted', 'under_review', 'approved', 'rejected', 'paid'],
      default: 'submitted',
    },
    payoutAmount: { type: Number, default: 0, min: 0 },
    photos: { type: [String], default: [] },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewNote: { type: String },
  },
  { timestamps: true }
);

insuranceClaimSchema.index({ userId: 1, createdAt: -1 });
insuranceClaimSchema.index({ status: 1, createdAt: -1 });

export const InsuranceClaim = model<IInsuranceClaim>('InsuranceClaim', insuranceClaimSchema);
