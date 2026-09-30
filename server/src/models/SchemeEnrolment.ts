import { Schema, model, Types } from 'mongoose';
import { SCHEME_CODES, type SchemeCode } from './SchemePlan';

/**
 * A record that someone has been helped to enrol in PMSBY or PMJJBY THROUGH
 * THEIR OWN BANK. FYRO writes down the bank, the nominee, the person's consent
 * and, once the bank gives it, the bank's reference. The bank holds the
 * account and the policy; nothing here is an insurance policy.
 */
export type EnrolmentStatus = 'recorded' | 'confirmed_by_bank' | 'lapsed';

export interface ISchemeEnrolment {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  scheme: SchemeCode;
  status: EnrolmentStatus;
  bankName: string;
  /** Only the last four digits of the account, if given. */
  accountLast4?: string;
  nominee: { name: string; relation: string };
  consentAt: Date;
  /** True when a society leader recorded consent for a member who has no phone. */
  consentOnBehalf: boolean;
  recordedByUserId: Types.ObjectId;
  /** The bank's own reference, once the bank has enrolled them. */
  bankReference?: string;
  confirmedAt?: Date;
  /** Next annual premium falls due on or after this date. Set when the bank confirms. */
  renewalDate?: Date;
  premiums: { forRenewalDate: Date; amount: number; paidAt: Date }[];
  /** Why the last renewal did not go through, if it did not. Cleared by the next one that does. */
  renewalHold?: { reason: 'premium_not_set' | 'pool_insufficient' | 'no_district'; since: Date; notifiedAt?: Date };
  renewalLockAt?: Date;
  createdAt: Date;
}

const enrolmentSchema = new Schema<ISchemeEnrolment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scheme: { type: String, enum: SCHEME_CODES, required: true },
    status: { type: String, enum: ['recorded', 'confirmed_by_bank', 'lapsed'], default: 'recorded' },
    bankName: { type: String, required: true, trim: true, maxlength: 100 },
    accountLast4: { type: String, match: /^\d{4}$/ },
    nominee: {
      name: { type: String, required: true, trim: true, maxlength: 100 },
      relation: { type: String, required: true, trim: true, maxlength: 40 },
    },
    consentAt: { type: Date, required: true },
    consentOnBehalf: { type: Boolean, default: false },
    recordedByUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    bankReference: { type: String, trim: true, maxlength: 60 },
    confirmedAt: { type: Date },
    renewalDate: { type: Date, index: true },
    premiums: [{ forRenewalDate: Date, amount: Number, paidAt: Date, _id: false }],
    renewalHold: {
      type: { reason: { type: String, enum: ['premium_not_set', 'pool_insufficient', 'no_district'] }, since: Date, notifiedAt: Date },
      _id: false,
      default: undefined,
    },
    renewalLockAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One live enrolment per person per scheme.
enrolmentSchema.index({ userId: 1, scheme: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['recorded', 'confirmed_by_bank'] } } });

export const SchemeEnrolment = model<ISchemeEnrolment>('SchemeEnrolment', enrolmentSchema);
