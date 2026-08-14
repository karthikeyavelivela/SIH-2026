import { Schema, model, Types } from 'mongoose';

export interface IAuditLog {
  _id: Types.ObjectId;
  actorId: Types.ObjectId;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: Types.ObjectId;
  details: Record<string, unknown>;
  timestamp: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: Schema.Types.ObjectId, required: true },
  details: { type: Schema.Types.Mixed, default: {} },
  timestamp: { type: Date, default: Date.now },
});

auditLogSchema.index({ timestamp: -1 });

export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
