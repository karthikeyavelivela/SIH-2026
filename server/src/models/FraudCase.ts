import { Schema, model, Types } from 'mongoose';
import type { FraudSeverity } from './FraudSignal';

export type FraudCaseStatus = 'open' | 'investigating' | 'cleared' | 'suspended';

// Case-management wrapper around one or more FraudSignal detections for a
// single user. Resolving a case as 'suspended' is the one path in this
// model that has a real side effect (User.accountStatus = 'suspended') —
// see fraud.controller.ts's resolveFraudCase, which requires the same
// confirm-modal pattern as UserTable.tsx's suspend/delete actions.
export interface IFraudCase {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  signalIds: Types.ObjectId[];
  severity: FraudSeverity;
  status: FraudCaseStatus;
  notes?: string;
  resolvedByAdminId?: Types.ObjectId;
  resolvedAt?: Date;
  createdAt: Date;
}

const fraudCaseSchema = new Schema<IFraudCase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    signalIds: { type: [Schema.Types.ObjectId], ref: 'FraudSignal', default: [] },
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
    status: { type: String, enum: ['open', 'investigating', 'cleared', 'suspended'], default: 'open' },
    notes: { type: String },
    resolvedByAdminId: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

fraudCaseSchema.index({ status: 1, createdAt: -1 });

export const FraudCase = model<IFraudCase>('FraudCase', fraudCaseSchema);
