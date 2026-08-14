import { AuditLog } from '../models/AuditLog';
import type { Role } from '@fyro/shared';

interface WriteAuditLogInput {
  actorId: string;
  actorRole: Role;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown>;
}

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  await AuditLog.create({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    details: input.details ?? {},
    timestamp: new Date(),
  });
}
