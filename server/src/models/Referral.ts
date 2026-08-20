import { Schema, model, Types } from 'mongoose';

export type ReferralStatus = 'invited' | 'signed_up' | 'first_job_completed' | 'bonus_paid';

// One row per person a worker has referred. `code` is the referrer's own
// referral code, denormalized onto every row they create (see
// referral.controller's referralCodeForUser — deterministic per user, so
// "my code" never needs its own storage/row). `referredUserId` starts null
// and is filled in once a FYRO account with a matching phone number shows
// up (see referral.controller.getMyReferrals's lazy-link step and
// admin/referral.controller's checkPayouts scan).
export interface IReferral {
  _id: Types.ObjectId;
  referrerId: Types.ObjectId;
  referredPhone: string;
  referredUserId?: Types.ObjectId;
  status: ReferralStatus;
  bonusAmount: number;
  code: string;
  createdAt: Date;
  updatedAt: Date;
}

const referralSchema = new Schema<IReferral>(
  {
    referrerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referredPhone: { type: String, required: true, trim: true },
    referredUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['invited', 'signed_up', 'first_job_completed', 'bonus_paid'], default: 'invited' },
    bonusAmount: { type: Number, default: 500 },
    code: { type: String, required: true, uppercase: true, trim: true },
  },
  { timestamps: true }
);

// A referrer inviting the same phone number twice is a re-send, not a new
// referral row.
referralSchema.index({ referrerId: 1, referredPhone: 1 }, { unique: true });
referralSchema.index({ code: 1 });
referralSchema.index({ status: 1 });

export const Referral = model<IReferral>('Referral', referralSchema);
