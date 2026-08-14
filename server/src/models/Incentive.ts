import { Schema, model, Types } from 'mongoose';

export interface IIncentive {
  _id: Types.ObjectId;
  targetUserId?: Types.ObjectId;
  targetMuthaId?: Types.ObjectId;
  period: string;
  ratingAvgAtGrant: number;
  bonusAmount: number;
  criteriaSnapshot: string;
  grantedByAdminId: Types.ObjectId;
  createdAt: Date;
}

const incentiveSchema = new Schema<IIncentive>(
  {
    targetUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    targetMuthaId: { type: Schema.Types.ObjectId, ref: 'Mutha' },
    period: { type: String, required: true },
    ratingAvgAtGrant: { type: Number, required: true },
    bonusAmount: { type: Number, required: true, min: 0 },
    criteriaSnapshot: { type: String, required: true },
    grantedByAdminId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Incentive = model<IIncentive>('Incentive', incentiveSchema);
