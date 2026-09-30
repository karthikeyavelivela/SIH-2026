import { AuditLog } from '../models/AuditLog';
import type { Role } from '@fyro/shared';

/**
 * The actor recorded for actions the platform takes on its own — the
 * auto-confirm runner, scheduled jobs. A fixed, recognisable id rather than
 * borrowing a real user's, so "who did this" never names someone who
 * didn't.
 */
export const SYSTEM_ACTOR_ID = '000000000000000000000000';

interface WriteAuditLogInput {
  actorId: string;
  actorRole: Role | 'system';
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
