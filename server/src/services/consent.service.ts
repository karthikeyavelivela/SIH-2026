import { Types } from 'mongoose';
import { CONSENT_PURPOSES, REQUIRED_CONSENT_PURPOSES, PRIVACY_NOTICE_VERSION, type ConsentPurpose } from '@fyro/shared';
import { ConsentRecord } from '../models/ConsentRecord';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from './audit.service';

export type ConsentChoice = Partial<Record<ConsentPurpose, boolean>>;

export interface ConsentState {
  noticeVersion: string;
  purposes: Record<ConsentPurpose, boolean>;
  /** False until they have agreed under the current notice version. */
  current: boolean;
  recordedAt?: Date;
}

/** Latest decision, or an all-false state for someone who never gave one. */
export async function getConsent(userId: string): Promise<ConsentState> {
  const latest = await ConsentRecord.findOne({ userId }).sort({ createdAt: -1 }).lean();
  const blank = Object.fromEntries(CONSENT_PURPOSES.map((p) => [p, false])) as Record<ConsentPurpose, boolean>;
  if (!latest) return { noticeVersion: PRIVACY_NOTICE_VERSION, purposes: blank, current: false };
  return {
    noticeVersion: latest.noticeVersion,
    purposes: { ...blank, ...(latest.purposes as Record<ConsentPurpose, boolean>) },
    current: latest.noticeVersion === PRIVACY_NOTICE_VERSION && REQUIRED_CONSENT_PURPOSES.every((p) => (latest.purposes as Record<string, boolean>)[p]),
    recordedAt: (latest as { createdAt?: Date }).createdAt,
  };
}

/**
 * Records a decision. The required purposes must all be true: there is no
 * half-consent to identity checks or payments while still using the app.
 * Optional ones default to whatever the person chose before (or false).
 */
export async function recordConsent(userId: string, choice: ConsentChoice, source: 'signup' | 'settings'): Promise<ConsentState> {
  const missing = REQUIRED_CONSENT_PURPOSES.filter((p) => choice[p] !== true);
  if (source === 'signup' && missing.length > 0) {
    throw new ApiError(400, 'The required consents must be accepted to create an account');
  }
  const previous = await getConsent(userId);
  const purposes = Object.fromEntries(
    CONSENT_PURPOSES.map((p) => [p, REQUIRED_CONSENT_PURPOSES.includes(p) ? previous.purposes[p] || choice[p] === true : choice[p] ?? previous.purposes[p]])
  ) as Record<ConsentPurpose, boolean>;
  await ConsentRecord.create({ userId: new Types.ObjectId(userId), noticeVersion: PRIVACY_NOTICE_VERSION, purposes, source });
  await writeAuditLog({
    actorId: userId,
    actorRole: 'system',
    action: 'consent_recorded',
    targetType: 'User',
    targetId: userId,
    details: { source, noticeVersion: PRIVACY_NOTICE_VERSION, purposes },
  });
  return getConsent(userId);
}

/** The optional purposes can be withdrawn or given again at any time. */
export async function updateOptionalConsent(userId: string, choice: ConsentChoice): Promise<ConsentState> {
  const current = await getConsent(userId);
  const optional = CONSENT_PURPOSES.filter((p) => !REQUIRED_CONSENT_PURPOSES.includes(p));
  const merged: ConsentChoice = { ...current.purposes };
  for (const p of optional) if (choice[p] !== undefined) merged[p] = choice[p];
  // Re-record with the required purposes as they already stand.
  const requiredOk = REQUIRED_CONSENT_PURPOSES.every((p) => current.purposes[p]);
  if (!requiredOk) throw new ApiError(409, 'Accept the current privacy notice first');
  return recordConsent(userId, merged, 'settings');
}
