import { Schema, model, Types } from 'mongoose';
import { QUOTATION_STATUSES, UNIT_TYPES, type QuotationStatus, type UnitType } from '@fyro/shared';

/**
 * A priced-after-inspection job.
 *
 * Instant booking cannot express work whose price nobody can know until
 * somebody has looked at it — a rewire, a bespoke wardrobe, a renovation.
 * This is that path, and it has a different shape: request, site visit,
 * itemised quotation, a validity window, one round of negotiation, and only
 * then a booking with an agreed price.
 *
 * Two rules are structural rather than procedural here:
 *
 *   1. `frozenTotal` is written once, at acceptance, and is what the booking
 *      charges from then on. Nothing recomputes it at read time. This is the
 *      same discipline CommissionRecord already follows, for the same reason:
 *      a number a customer agreed to must not be able to drift because a
 *      rate changed afterwards.
 *
 *   2. After acceptance, line items are immutable. The only way the amount
 *      can move is an approved VariationOrder, which is a separate document
 *      with its own customer approval. There is no code path that edits an
 *      accepted quotation's items — see quotation.service.ts.
 *
 * `revisions` keeps every superseded version rather than overwriting. When a
 * customer and a worker disagree about what was quoted, the answer should be
 * in the record, not in either person's memory.
 */

export interface IQuotationLineItem {
  description: string;
  unitType?: UnitType;
  quantity: number;
  rate: number;
  amount: number;
  /** Materials are listed separately from labour and totalled separately. */
  isMaterial: boolean;
  /** A material price that is an estimate must say so — the customer is agreeing to a range, not a number. */
  materialIsEstimate: boolean;
}

export interface IQuotationMilestone {
  label: string;
  percentage: number;
  amount: number;
  status: 'pending' | 'confirmed' | 'paid';
  confirmedAt?: Date;
}

export interface IQuotationRevision {
  lineItems: IQuotationLineItem[];
  labourSubtotal: number;
  materialSubtotal: number;
  total: number;
  submittedAt: Date;
  /** Who caused this version to be superseded, and what they said. */
  supersededBy: 'worker' | 'customer';
  note?: string;
}

export interface IQuotation {
  _id: Types.ObjectId;
  bookingId?: Types.ObjectId;
  workerId: Types.ObjectId;
  customerId: Types.ObjectId;
  categorySlug: string;
  status: QuotationStatus;
  /** What the customer said they needed, before anyone looked. */
  jobDescription: string;
  photos: string[];
  siteVisit?: {
    scheduledAt?: Date;
    completedAt?: Date;
    fee: number;
    feeAdjustable: boolean;
  };
  lineItems: IQuotationLineItem[];
  labourSubtotal: number;
  materialSubtotal: number;
  total: number;
  validUntil?: Date;
  revisions: IQuotationRevision[];
  /** Set once, at acceptance. The booking charges this and nothing else. */
  frozenTotal?: number;
  acceptedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  milestones: IQuotationMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

/** Above this, a quotation is paid in milestones rather than all at the end. */
export const MILESTONE_THRESHOLD_RUPEES = 25000;
/** How long a submitted quotation stands, unless the worker says otherwise. */
export const DEFAULT_VALIDITY_DAYS = 7;

const lineItemSchema = new Schema<IQuotationLineItem>(
  {
    description: { type: String, required: true, trim: true, maxlength: 200 },
    unitType: { type: String, enum: UNIT_TYPES },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    isMaterial: { type: Boolean, default: false },
    materialIsEstimate: { type: Boolean, default: false },
  },
  { _id: false }
);

const milestoneSchema = new Schema<IQuotationMilestone>(
  {
    label: { type: String, required: true },
    percentage: { type: Number, required: true, min: 1, max: 100 },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['pending', 'confirmed', 'paid'], default: 'pending' },
    confirmedAt: { type: Date },
  },
  { _id: false }
);

const revisionSchema = new Schema<IQuotationRevision>(
  {
    lineItems: { type: [lineItemSchema], default: [] },
    labourSubtotal: { type: Number, default: 0 },
    materialSubtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    submittedAt: { type: Date, required: true },
    supersededBy: { type: String, enum: ['worker', 'customer'], required: true },
    note: { type: String, maxlength: 500 },
  },
  { _id: false }
);

const quotationSchema = new Schema<IQuotation>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    categorySlug: { type: String, required: true },
    status: { type: String, enum: QUOTATION_STATUSES, default: 'requested', index: true },
    jobDescription: { type: String, required: true, maxlength: 2000 },
    photos: [{ type: String }],
    siteVisit: {
      scheduledAt: { type: Date },
      completedAt: { type: Date },
      fee: { type: Number, default: 0, min: 0 },
      feeAdjustable: { type: Boolean, default: true },
    },
    lineItems: { type: [lineItemSchema], default: [] },
    labourSubtotal: { type: Number, default: 0 },
    materialSubtotal: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    validUntil: { type: Date },
    revisions: { type: [revisionSchema], default: [] },
    frozenTotal: { type: Number },
    acceptedAt: { type: Date },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },
    milestones: { type: [milestoneSchema], default: [] },
  },
  { timestamps: true }
);

quotationSchema.index({ customerId: 1, updatedAt: -1 });
quotationSchema.index({ workerId: 1, status: 1, updatedAt: -1 });

export const Quotation = model<IQuotation>('Quotation', quotationSchema);
