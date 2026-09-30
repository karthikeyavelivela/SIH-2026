import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { Booking } from '../models/Booking';
import { HamaliProfile } from '../models/HamaliProfile';
import { Mutha } from '../models/Mutha';
import { Payout } from '../models/Payout';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog } from './audit.service';
import { markAvailableToday } from './activity.service';
import { outstandingKycDocs, kycGateMessage } from './kyc.service';
import { generateOtp, sendOtpSms, verifyOtp, OTP_MAX_ATTEMPTS } from './otp.service';
import { workerRateOf } from './serviceFee.service';
import { storeKycDocument } from '../controllers/kycDocument.controller';
import type { KycDocumentType } from '@fyro/shared';

/**
 * P1.7 — members without a phone.
 *
 * Many of the people a loading society represents share a phone or have
 * none. Without an account they cannot be assigned, paid or insured, so the
 * leader holds one for them: creates it, uploads their KYC (reviewed like
 * anyone's), sets their availability, and — with an explicit consent tick —
 * their payout details. Their earnings are theirs: jobs are assigned to the
 * member's own account, so their passbook and ledger are their own, not the
 * leader's. When they get a phone, the leader gives them a one-time claim
 * code; they verify the phone by OTP, set a password, and the account
 * becomes fully theirs. A leader can only ever touch members of their own
 * society. Everything is audited.
 */

const BCRYPT_COST = 12;
const CLAIM_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CLAIM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_CLAIM_ATTEMPTS = 5;

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code.trim().toUpperCase()).digest('hex');
}

function newClaimCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => CLAIM_ALPHABET[b % CLAIM_ALPHABET.length]).join('');
}

async function leaderSociety(leaderId: string) {
  const mutha = await Mutha.findOne({ leaderId }).select('_id memberIds name').lean();
  if (!mutha) throw new ApiError(404, 'No society found for this leader');
  return mutha;
}

/** A proxy member of the caller's own society, or 404 — other societies' members do not exist here. */
async function ownProxyMember(leaderId: string, memberId: string) {
  const mutha = await leaderSociety(leaderId);
  const member = await User.findOne({ _id: memberId, leaderManaged: true, managedByMuthaId: mutha._id });
  if (!member || !mutha.memberIds.some((m) => String(m) === memberId)) throw new ApiError(404, 'Member not found');
  return { mutha, member };
}

async function audit(actorId: string, action: string, memberId: string, details: Record<string, unknown> = {}) {
  await writeAuditLog({ actorId, actorRole: 'mutha_leader', action, targetType: 'User', targetId: memberId, details });
}

export async function createProxyMember(leaderId: string, input: { name: string; region?: string; skills?: string[] }) {
  const mutha = await leaderSociety(leaderId);
  const leader = await User.findById(leaderId).select('region').lean();
  const id = new Types.ObjectId();
  const member = await User.create({
    _id: id,
    name: input.name,
    // Reserved and non-dialable: nobody can sign in with it.
    phone: `proxy-${id.toString()}`,
    passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_COST),
    role: 'mutha_member',
    region: input.region ?? leader?.region,
    leaderManaged: true,
    managedByMuthaId: mutha._id,
  });
  await HamaliProfile.create({ userId: member._id, type: 'mutha_member', muthaId: mutha._id, skills: input.skills ?? [] });
  await Mutha.updateOne({ _id: mutha._id }, { $addToSet: { memberIds: member._id } });
  await audit(leaderId, 'proxy_member_created', member._id.toString(), { muthaId: mutha._id.toString() });
  return member;
}

export async function listProxyMembers(leaderId: string) {
  const mutha = await leaderSociety(leaderId);
  const members = await User.find({ leaderManaged: true, managedByMuthaId: mutha._id, _id: { $in: mutha.memberIds } })
    .select('name kycStatus kycDocs payoutDetails payoutConsent region createdAt')
    .lean();
  const profiles = await HamaliProfile.find({ userId: { $in: members.map((m) => m._id) } }).select('userId availabilityStatus').lean();
  const status = new Map(profiles.map((p) => [String(p.userId), p.availabilityStatus]));
  return members.map((m) => ({
    _id: m._id,
    name: m.name,
    kycStatus: m.kycStatus,
    kycDocs: (m.kycDocs ?? []).map((d) => ({ _id: d._id, type: d.type, status: d.status })),
    availabilityStatus: status.get(String(m._id)) ?? 'offline',
    hasPayout: !!m.payoutDetails?.method,
    payoutConsentAt: m.payoutConsent?.at,
  }));
}

export async function uploadKycFor(leaderId: string, memberId: string, type: KycDocumentType, fileBase64: string) {
  await ownProxyMember(leaderId, memberId);
  const document = await storeKycDocument(memberId, type, fileBase64);
  await audit(leaderId, 'proxy_member_kyc_uploaded', memberId, { type });
  return document;
}

export async function setAvailabilityFor(
  leaderId: string,
  memberId: string,
  status: 'online' | 'offline',
  location?: { lat: number; lng: number }
) {
  const { member } = await ownProxyMember(leaderId, memberId);
  if (status === 'online') {
    // The same KYC gate as anyone going online — a leader cannot bypass it.
    const outstanding = outstandingKycDocs(member);
    if (outstanding.length > 0) throw new ApiError(403, kycGateMessage(outstanding));
    if (!location) throw new ApiError(400, 'A location is required to go online');
  }
  const update: Record<string, unknown> = { availabilityStatus: status };
  if (location) update.currentLocation = { type: 'Point', coordinates: [location.lng, location.lat] };
  const profile = await HamaliProfile.findOneAndUpdate({ userId: memberId, type: 'mutha_member' }, update, { new: true });
  if (!profile) throw new ApiError(404, 'No member profile found');
  if (status === 'online') await markAvailableToday(memberId);
  await audit(leaderId, 'proxy_member_availability_set', memberId, { status });
  return { availabilityStatus: profile.availabilityStatus };
}

export async function setPayoutFor(
  leaderId: string,
  memberId: string,
  details: { method: 'bank' | 'upi'; accountHolderName?: string; bankAccountNumber?: string; ifsc?: string; upiId?: string },
  consent: boolean
) {
  if (consent !== true) throw new ApiError(400, "The member's consent must be confirmed before saving payout details for them");
  const { member } = await ownProxyMember(leaderId, memberId);
  member.payoutDetails = { ...details, updatedAt: new Date() };
  member.payoutConsent = { byUserId: new Types.ObjectId(leaderId), at: new Date() };
  await member.save();
  // The account number itself never goes into the audit log.
  await audit(leaderId, 'proxy_member_payout_set', memberId, { method: details.method, consent: true });
  return { method: details.method, consentAt: member.payoutConsent.at };
}

/** A member's own earnings — assigned to their account, never the leader's. */
export async function memberEarnings(leaderId: string, memberId: string) {
  await ownProxyMember(leaderId, memberId);
  const jobs = await Booking.find({ status: 'completed', assignedHamaliIds: memberId }).select('fareBreakdown assignedHamaliIds contractVisitDate statusHistory').lean();
  const lines = jobs.map((b) => ({
    bookingId: b._id.toString(),
    amount: Math.round((workerRateOf(b.fareBreakdown) / Math.max(1, b.assignedHamaliIds.length)) * 100) / 100,
  }));
  const payouts = await Payout.find({ userId: memberId }).select('amount status source createdAt').sort({ createdAt: -1 }).limit(20).lean();
  return { total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, jobs: lines.length, lines, payouts };
}

/** A one-time code the leader hands the member in person. Shown once; stored only as a hash. */
export async function issueClaimCode(leaderId: string, memberId: string) {
  await ownProxyMember(leaderId, memberId);
  const code = newClaimCode();
  await User.updateOne(
    { _id: memberId },
    { claimCodeHash: hashCode(code), claimCodeExpiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS), claimAttempts: 0, $unset: { pendingClaim: 1 } }
  );
  await audit(leaderId, 'proxy_member_claim_code_issued', memberId);
  return { code, expiresAt: new Date(Date.now() + CLAIM_CODE_TTL_MS) };
}

async function byClaimCode(code: string) {
  const user = await User.findOne({ claimCodeHash: hashCode(code), leaderManaged: true }).select(
    '+claimCodeHash +claimCodeExpiresAt +claimAttempts +pendingClaim'
  );
  if (!user || !user.claimCodeExpiresAt || user.claimCodeExpiresAt < new Date()) {
    throw new ApiError(400, 'This claim code is not valid or has expired. Ask your society leader for a new one.');
  }
  if ((user.claimAttempts ?? 0) >= MAX_CLAIM_ATTEMPTS) {
    throw new ApiError(429, 'Too many attempts with this code. Ask your society leader for a new one.');
  }
  return user;
}

/** Step 1: the member enters the code and their phone; an OTP is sent to that phone. */
export async function startClaim(code: string, phone: string) {
  const user = await byClaimCode(code);
  if (await User.exists({ phone, _id: { $ne: user._id } })) {
    throw new ApiError(409, 'This phone number already has an account');
  }
  const { code: otp, hash, expiresAt, devCode } = await generateOtp();
  user.pendingClaim = { phone, otpHash: hash, expiresAt, attempts: 0 };
  await user.save();
  await sendOtpSms(phone, otp);
  return { expiresAt, devOtp: devCode };
}

/** Step 2: OTP + a password; the account becomes the member's own. */
export async function completeClaim(code: string, phone: string, otp: string, password: string) {
  const user = await byClaimCode(code);
  const pending = user.pendingClaim;
  if (!pending || pending.phone !== phone || pending.expiresAt < new Date()) {
    throw new ApiError(400, 'Request a new code for this phone first');
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS || !(await verifyOtp(otp, pending.otpHash))) {
    user.claimAttempts = (user.claimAttempts ?? 0) + 1;
    user.pendingClaim = { ...pending, attempts: pending.attempts + 1 };
    await user.save();
    throw new ApiError(400, 'That OTP is not right');
  }
  if (await User.exists({ phone, _id: { $ne: user._id } })) throw new ApiError(409, 'This phone number already has an account');

  await User.updateOne(
    { _id: user._id },
    {
      phone,
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      leaderManaged: false,
      claimedAt: new Date(),
      $unset: { claimCodeHash: 1, claimCodeExpiresAt: 1, claimAttempts: 1, pendingClaim: 1 },
    }
  );
  await writeAuditLog({
    actorId: user._id.toString(),
    actorRole: 'mutha_member',
    action: 'proxy_member_claimed',
    targetType: 'User',
    targetId: user._id.toString(),
    details: {},
  });
  return { ok: true };
}
