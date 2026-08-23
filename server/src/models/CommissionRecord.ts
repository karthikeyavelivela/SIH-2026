import { Schema, model, Types } from 'mongoose';

// SIH26089 Phase B.2 — "every worker sees exactly what was deducted and
// why, on every job" (the PS's own transparency ask). One row per
// completed, Society-assigned job a member actually got paid for — the
// real, itemized deduction record a worker's earnings screen reads
// directly, rather than the worker having to trust an unexplained
// smaller-than-expected number. Written by governance.service.ts's
// applySocietyDeduction at the exact same moment the deduction is
// actually applied to what the worker is paid (earnings.controller.ts /
// parametricInsurance.service.ts's computeTrailingEarnings) — never a
// separate, possibly-inconsistent disclosure computed after the fact.
export interface ICommissionRecord {
  _id: Types.ObjectId;
  bookingId: Types.ObjectId;
  muthaId: Types.ObjectId;
  workerId: Types.ObjectId;
  grossAmount: number;
  commissionRatePct: number;
  commissionAmount: number;
  welfareRatePct: number;
  welfareAmount: number;
  netAmount: number;
  createdAt: Date;
}

const commissionRecordSchema = new Schema<ICommissionRecord>(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    muthaId: { type: Schema.Types.ObjectId, ref: 'Mutha', required: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    grossAmount: { type: Number, required: true },
    commissionRatePct: { type: Number, required: true },
    commissionAmount: { type: Number, required: true },
    welfareRatePct: { type: Number, required: true },
    welfareAmount: { type: Number, required: true },
    netAmount: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// One deduction record per (booking, worker) pair — a job is only ever
// completed once, so applySocietyDeduction is only ever called once per
// worker per booking; the unique index makes a double-write structurally
// impossible rather than just unlikely.
commissionRecordSchema.index({ bookingId: 1, workerId: 1 }, { unique: true });
commissionRecordSchema.index({ workerId: 1, createdAt: -1 });
commissionRecordSchema.index({ muthaId: 1, createdAt: -1 });

export const CommissionRecord = model<ICommissionRecord>('CommissionRecord', commissionRecordSchema);
