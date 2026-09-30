import { Schema, model, Types } from 'mongoose';

/**
 * The two government micro-insurance schemes members can be helped into:
 * PMSBY (accident cover) and PMJJBY (life cover). FYRO does not sell or
 * underwrite either; the member enrols through their own bank.
 *
 * The premium and cover figures are DELIBERATELY EMPTY until an admin enters
 * the current ones with a source link. They are government figures that have
 * changed before, and this product does not guess them: until they are set,
 * renewals are held, not debited.
 */
export type SchemeCode = 'pmsby' | 'pmjjby';
export const SCHEME_CODES: SchemeCode[] = ['pmsby', 'pmjjby'];

export interface ISchemePlan {
  _id: Types.ObjectId;
  code: SchemeCode;
  name: string;
  /** Annual premium in rupees, as published. Null until an admin sets it. */
  premiumAnnual: number | null;
  /** Cover in rupees, as published. Null until an admin sets it. */
  coverageAmount: number | null;
  /** Where the figures above were read, required whenever either is set. */
  sourceUrl?: string;
  sourceNote?: string;
  updatedByUserId?: Types.ObjectId;
  updatedAt: Date;
}

const schemePlanSchema = new Schema<ISchemePlan>(
  {
    code: { type: String, enum: SCHEME_CODES, required: true, unique: true },
    name: { type: String, required: true },
    premiumAnnual: { type: Number, default: null, min: 0 },
    coverageAmount: { type: Number, default: null, min: 0 },
    sourceUrl: { type: String, trim: true, maxlength: 500 },
    sourceNote: { type: String, trim: true, maxlength: 300 },
    updatedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

export const SchemePlan = model<ISchemePlan>('SchemePlan', schemePlanSchema);
