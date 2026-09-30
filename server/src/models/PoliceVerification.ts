import { Schema, model, Types } from 'mongoose';

/**
 * A police verification certificate (or the reference of one), uploaded by the
 * worker, then approved or rejected by their society leader or by an admin.
 * An approval is good for twelve months from the day it is given; reminders go
 * out at 30 and 7 days before it ends, and once when it has.
 */
export type PoliceVerificationStatus = 'pending' | 'verified' | 'rejected';

export interface IPoliceVerification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  /** The certificate or reference number as the worker typed it. */
  referenceNumber?: string;
  /** The date on the certificate, if they gave it. */
  issuedOn?: Date;
  file?: { publicId: string; format: string; resourceType: 'image' | 'raw'; uploadedAt: Date };
  status: PoliceVerificationStatus;
  rejectionReason?: string;
  reviewedByUserId?: Types.ObjectId;
  reviewedByRole?: string;
  reviewedAt?: Date;
  /** verifiedAt + 12 months. Set only when verified. */
  expiresAt?: Date;
  reminders: { sent30At?: Date; sent7At?: Date; sentExpiredAt?: Date };
  createdAt: Date;
}

const policeVerificationSchema = new Schema<IPoliceVerification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    referenceNumber: { type: String, trim: true, maxlength: 60 },
    issuedOn: { type: Date },
    file: {
      type: { publicId: String, format: String, resourceType: { type: String, enum: ['image', 'raw'] }, uploadedAt: Date },
      _id: false,
      default: undefined,
    },
    status: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending', index: true },
    rejectionReason: { type: String, trim: true, maxlength: 300 },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedByRole: { type: String },
    reviewedAt: { type: Date },
    expiresAt: { type: Date, index: true },
    reminders: {
      sent30At: { type: Date },
      sent7At: { type: Date },
      sentExpiredAt: { type: Date },
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const PoliceVerification = model<IPoliceVerification>('PoliceVerification', policeVerificationSchema);
