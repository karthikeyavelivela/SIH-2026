import { Schema, model, Types } from 'mongoose';
import { CONSENT_PURPOSES, type ConsentPurpose } from '@fyro/shared';

/**
 * One row per consent decision, never edited. A person's current consent is
 * their latest row; the earlier rows are the history of what they agreed to
 * and when, under which version of the notice.
 */
export interface IConsentRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  noticeVersion: string;
  purposes: Record<ConsentPurpose, boolean>;
  source: 'signup' | 'settings';
  createdAt: Date;
}

const purposeShape = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, { type: Boolean, required: true }]));

const consentRecordSchema = new Schema<IConsentRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    noticeVersion: { type: String, required: true },
    purposes: { type: new Schema(purposeShape, { _id: false }), required: true },
    source: { type: String, enum: ['signup', 'settings'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

consentRecordSchema.index({ userId: 1, createdAt: -1 });

export const ConsentRecord = model<IConsentRecord>('ConsentRecord', consentRecordSchema);
