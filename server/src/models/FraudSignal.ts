import { Schema, model, Types } from 'mongoose';

export type FraudSeverity = 'low' | 'medium' | 'high' | 'critical';

// A single raw detection event. Later phases wire real detectors (GPS
// spoofing, multi-device login, fare manipulation) to write these; for now
// they are manually/seed-creatable and consumed by FraudCase case
// management (fraud.controller.ts).
export interface IFraudSignal {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  detectorType: string; // e.g. 'gps_spoofing', 'multi_device_login', 'fare_manipulation'
  severity: FraudSeverity;
  evidence: Record<string, unknown>;
  caseId?: Types.ObjectId;
  detectedAt: Date;
}

const fraudSignalSchema = new Schema<IFraudSignal>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  detectorType: { type: String, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  evidence: { type: Schema.Types.Mixed, default: {} },
  caseId: { type: Schema.Types.ObjectId, ref: 'FraudCase' },
  detectedAt: { type: Date, default: Date.now },
});

fraudSignalSchema.index({ userId: 1, detectedAt: -1 });

export const FraudSignal = model<IFraudSignal>('FraudSignal', fraudSignalSchema);
