import { Schema, model, Types } from 'mongoose';

export type CertificationStatus = 'active' | 'expired';

// Issued automatically (training.controller.completeModule) once a user
// completes every TrainingModule targeting their role. `qrPayload` is a
// stable per-cert verification string the QRCodeDisplay component encodes —
// a depot gate can scan it and match against GET /api/training/certifications
// (or, if a public verify page is added later, against `_id`).
export interface ICertification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  endorsedSkills: string[];
  issuedAt: Date;
  validUntil: Date;
  status: CertificationStatus;
  qrPayload: string;
  createdAt: Date;
  updatedAt: Date;
}

const certificationSchema = new Schema<ICertification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    endorsedSkills: { type: [String], default: [] },
    issuedAt: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    status: { type: String, enum: ['active', 'expired'], default: 'active' },
    qrPayload: { type: String, required: true },
  },
  { timestamps: true }
);

// One certification per (user, curriculum) — title is deterministic per
// role ("FYRO Certified Operator — Driver") so this also prevents the
// completeModule auto-issue logic from ever double-issuing.
certificationSchema.index({ userId: 1, title: 1 }, { unique: true });

export const Certification = model<ICertification>('Certification', certificationSchema);
