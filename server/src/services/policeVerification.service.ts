import { Types } from 'mongoose';
import { PoliceVerification, type IPoliceVerification } from '../models/PoliceVerification';
import { User } from '../models/User';
import { Mutha } from '../models/Mutha';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from './audit.service';
import { createNotification } from './notification.service';
import { storeCredentialFile, credentialFileLink } from './credentialFile.service';
import type { Role } from '@fyro/shared';

/**
 * Police verification: the worker uploads a certificate (or types its
 * reference), their society leader or an admin approves or rejects it, and an
 * approval lasts twelve months. Reminders go out 30 and 7 days before it ends,
 * and once after.
 *
 * A leader can review only their own society's members, and never themselves.
 * An admin, or a manager who holds verify_kyc, can review anyone.
 */
export const VALID_MONTHS = 12;
const DAY_MS = 86_400_000;

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // 29 Feb plus a year must land on 28 Feb, not spill into March.
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

interface Actor {
  id: string;
  role: Role;
}

export function view(r: IPoliceVerification & { _id: Types.ObjectId }, now = new Date()) {
  const validNow = r.status === 'verified' && !!r.expiresAt && r.expiresAt > now;
  return {
    _id: r._id,
    status: r.status,
    referenceNumber: r.referenceNumber,
    issuedOn: r.issuedOn,
    hasFile: Boolean(r.file),
    rejectionReason: r.rejectionReason,
    reviewedAt: r.reviewedAt,
    expiresAt: r.expiresAt,
    validNow,
    daysLeft: validNow && r.expiresAt ? Math.ceil((r.expiresAt.getTime() - now.getTime()) / DAY_MS) : undefined,
    expired: r.status === 'verified' && !validNow,
    createdAt: r.createdAt,
  };
}

export async function submit(userId: string, role: Role, input: { referenceNumber?: string; issuedOn?: string; fileBase64?: string }) {
  if (!input.referenceNumber?.trim() && !input.fileBase64) throw new ApiError(400, 'Add the certificate or its reference number.');
  if (await PoliceVerification.exists({ userId, status: 'pending' })) {
    throw new ApiError(409, 'You already have a police verification waiting to be reviewed.');
  }
  const file = input.fileBase64 ? await storeCredentialFile(`police-verification/${userId}`, input.fileBase64) : undefined;
  const r = await PoliceVerification.create({
    userId,
    referenceNumber: input.referenceNumber?.trim() || undefined,
    issuedOn: input.issuedOn ? new Date(input.issuedOn) : undefined,
    file,
  });
  await writeAuditLog({ actorId: userId, actorRole: role, action: 'police_verification_submitted', targetType: 'PoliceVerification', targetId: r._id.toString(), details: { hasFile: Boolean(file) } });
  return view(r);
}

export async function listMine(userId: string) {
  const all = await PoliceVerification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean();
  return all.map((r) => view(r as never));
}

async function societyMemberIds(leaderId: string): Promise<Types.ObjectId[]> {
  const mutha = await Mutha.findOne({ leaderId }).select('memberIds').lean();
  return mutha?.memberIds ?? [];
}

async function isReviewerFor(actor: Actor, workerId: Types.ObjectId): Promise<boolean> {
  if (workerId.toString() === actor.id) return false; // nobody approves their own
  if (actor.role === 'admin') return true;
  if (actor.role === 'manager') {
    const me = await User.findById(actor.id).select('permissions').lean();
    return !!me?.permissions?.includes('verify_kyc');
  }
  if (actor.role === 'mutha_leader') return (await societyMemberIds(actor.id)).some((m) => m.equals(workerId));
  return false;
}

export async function queueFor(actor: Actor) {
  let filter: Record<string, unknown> = { status: 'pending' };
  if (actor.role === 'mutha_leader') filter = { status: 'pending', userId: { $in: await societyMemberIds(actor.id) } };
  else if (actor.role === 'manager') {
    const me = await User.findById(actor.id).select('permissions').lean();
    if (!me?.permissions?.includes('verify_kyc')) throw new ApiError(403, 'Forbidden');
  } else if (actor.role !== 'admin') throw new ApiError(403, 'Forbidden');

  const rows = await PoliceVerification.find(filter).sort({ createdAt: 1 }).limit(200).lean();
  const users = await User.find({ _id: { $in: rows.map((r) => r.userId) } }).select('name').lean();
  const names = new Map(users.map((u) => [u._id.toString(), u.name]));
  return rows.map((r) => ({ ...view(r as never), userId: r.userId, workerName: names.get(r.userId.toString()) ?? '' }));
}

export async function decide(actor: Actor, id: string, decision: 'verified' | 'rejected', reason?: string, now = new Date()) {
  const r = await PoliceVerification.findById(id);
  if (!r || !(await isReviewerFor(actor, r.userId))) throw new ApiError(404, 'Police verification not found');
  if (r.status !== 'pending') throw new ApiError(409, 'This one has already been reviewed.');
  if (decision === 'rejected' && !reason?.trim()) throw new ApiError(400, 'Say why it was not approved, so the worker knows what to fix.');

  r.status = decision;
  r.reviewedByUserId = new Types.ObjectId(actor.id);
  r.reviewedByRole = actor.role;
  r.reviewedAt = now;
  if (decision === 'verified') {
    r.expiresAt = addMonths(now, VALID_MONTHS);
    await User.updateOne({ _id: r.userId }, { policeVerifiedUntil: r.expiresAt });
  } else {
    r.rejectionReason = reason!.trim();
  }
  await r.save();

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role,
    action: decision === 'verified' ? 'police_verification_approved' : 'police_verification_rejected',
    targetType: 'PoliceVerification',
    targetId: r._id.toString(),
    details: { workerId: r.userId.toString(), ...(decision === 'verified' ? { expiresAt: r.expiresAt } : {}) },
  });
  await createNotification(r.userId.toString(), 'police_verification', {
    kind: decision,
    date: r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : '',
    reason: r.rejectionReason ?? '',
  });
  return view(r);
}

export async function viewLink(actor: Actor, id: string) {
  const r = await PoliceVerification.findById(id).lean();
  const allowed = r && (r.userId.toString() === actor.id || (await isReviewerFor(actor, r.userId)));
  // Not-found rather than forbidden: whether it exists is not the caller's business.
  if (!r || !allowed || !r.file) throw new ApiError(404, 'Document not found');
  if (r.userId.toString() !== actor.id) {
    await writeAuditLog({ actorId: actor.id, actorRole: actor.role, action: 'police_verification_document_viewed', targetType: 'PoliceVerification', targetId: id, details: {} });
  }
  const link = await credentialFileLink(r.file);
  return { url: link.url, expiresAt: link.expiresAt };
}

/**
 * Daily sweep. Each reminder goes out once: 30 days before, 7 days before, and
 * when the approval has ended (which also takes the badge off). Safe to run as
 * often as you like.
 */
export async function runPoliceVerificationReminders(now = new Date()): Promise<{ sent30: number; sent7: number; expired: number }> {
  const out = { sent30: 0, sent7: 0, expired: 0 };
  const soon = new Date(now.getTime() + 30 * DAY_MS);
  const due = await PoliceVerification.find({ status: 'verified', expiresAt: { $lte: soon } });

  for (const r of due) {
    const left = Math.ceil((r.expiresAt!.getTime() - now.getTime()) / DAY_MS);
    const date = r.expiresAt!.toISOString().slice(0, 10);
    if (left <= 0) {
      if (!r.reminders.sentExpiredAt) {
        r.reminders.sentExpiredAt = now;
        await r.save();
        await createNotification(r.userId.toString(), 'police_verification', { kind: 'expired', date, days: 0 });
        out.expired += 1;
      }
      // The badge goes only if no newer approval is still running.
      const current = await PoliceVerification.exists({ userId: r.userId, status: 'verified', expiresAt: { $gt: now } });
      if (!current) await User.updateOne({ _id: r.userId, policeVerifiedUntil: { $lte: now } }, { $unset: { policeVerifiedUntil: 1 } });
      continue;
    }
    // A newer approval running makes the older one's reminders moot.
    if (await PoliceVerification.exists({ userId: r.userId, status: 'verified', expiresAt: { $gt: r.expiresAt } })) continue;
    if (left <= 7 && !r.reminders.sent7At) {
      r.reminders.sent7At = now;
      await r.save();
      await createNotification(r.userId.toString(), 'police_verification', { kind: 'expiring7', days: left, date });
      out.sent7 += 1;
    } else if (left <= 30 && left > 7 && !r.reminders.sent30At) {
      r.reminders.sent30At = now;
      await r.save();
      await createNotification(r.userId.toString(), 'police_verification', { kind: 'expiring30', days: left, date });
      out.sent30 += 1;
    }
  }
  return out;
}

/** Federation panel: how many of these people hold a police verification that is valid today. */
export async function policeVerifiedCoverage(memberIds: Types.ObjectId[], now = new Date()) {
  const verified = memberIds.length ? await User.countDocuments({ _id: { $in: memberIds }, policeVerifiedUntil: { $gt: now } }) : 0;
  return { verified, total: memberIds.length, pct: memberIds.length ? Math.round((verified / memberIds.length) * 1000) / 10 : 0 };
}
