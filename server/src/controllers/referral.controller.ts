import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { env } from '../config/env';
import { Referral } from '../models/Referral';
import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';

const DEFAULT_BONUS = 500;

// Deterministic, collision-free per-user code — a pure function of the
// user's own ObjectId, so "my referral code" needs no storage of its own
// and GET/POST are both trivially idempotent (same input, same output,
// every time).
export function referralCodeForUser(userId: string): string {
  return `FYRO${userId.slice(-6).toUpperCase()}`;
}

// ---- GET /api/referrals/me ----
// Code + shareable link + stats, scoped to the caller's own referrals only
// (never a client-supplied referrerId).
export const getMyReferrals = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const code = referralCodeForUser(userId);

  // Lazily promote 'invited' -> 'signed_up' the moment a real account shows
  // up with that phone number — cheap enough at this scale, and keeps the
  // admin payout scan (checkReferralPayouts) working off up-to-date rows
  // without needing a hook into the signup flow itself.
  const invited = await Referral.find({ referrerId: userId, status: 'invited' });
  for (const r of invited) {
    const matchedUser = await User.findOne({ phone: r.referredPhone }).select('_id role').lean();
    if (matchedUser && (matchedUser.role === 'driver' || matchedUser.role === 'hamali_solo')) {
      r.status = 'signed_up';
      r.referredUserId = matchedUser._id;
      await r.save();
    }
  }

  const referrals = await Referral.find({ referrerId: userId }).sort({ createdAt: -1 }).lean();
  const totalEarned = referrals.filter((r) => r.status === 'bonus_paid').reduce((sum, r) => sum + r.bonusAmount, 0);
  const pending = referrals
    .filter((r) => r.status === 'signed_up' || r.status === 'first_job_completed')
    .reduce((sum, r) => sum + r.bonusAmount, 0);

  res.status(200).json({
    code,
    link: `${env.CLIENT_ORIGIN}/signup?ref=${code}`,
    stats: { totalEarned, pending, referrals },
  });
});

// ---- POST /api/referrals/code ----
// Deliberately a no-op beyond echoing the deterministic code back — "create
// my code" and "get my code" are the same idempotent operation since the
// code is never stored.
export const createMyReferralCode = asyncHandler(async (req: Request, res: Response) => {
  const code = referralCodeForUser(req.user!.id);
  res.status(200).json({ code, link: `${env.CLIENT_ORIGIN}/signup?ref=${code}` });
});

// ---- POST /api/referrals/invite ----
// body { phone }. Idempotent: re-inviting the same phone returns the
// existing row rather than erroring or duplicating it.
export const inviteReferral = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body as { phone: string };
  const code = referralCodeForUser(req.user!.id);

  let referral = await Referral.findOne({ referrerId: req.user!.id, referredPhone: phone });
  if (!referral) {
    referral = await Referral.create({
      referrerId: req.user!.id,
      referredPhone: phone,
      code,
      status: 'invited',
      bonusAmount: DEFAULT_BONUS,
    });
    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'referral_invited',
      targetType: 'Referral',
      targetId: referral._id.toString(),
      details: { referredPhone: phone },
    });
  }

  res.status(200).json({ referral });
});

// ---- POST /api/admin/referrals/check-payouts ----
// See training/referral build notes: the natural trigger point for a bonus
// payout is "a referred user's booking transitions to completed", which
// lives in requests.controller.ts (a shared, actively-developed file this
// task does not own). Rather than risk destabilizing that controller, the
// payout trigger is this admin-callable scan instead: it walks every
// 'signed_up' referral, looks for the referred user's first completed
// booking (as either an assigned driver or assigned hamali), and marks the
// bonus paid the moment one exists. Call it on a schedule (cron/manual ops
// action) until a push-based hook is wired into the booking-completion path.
export const checkReferralPayouts = asyncHandler(async (req: Request, res: Response) => {
  const candidates = await Referral.find({ status: 'signed_up', referredUserId: { $exists: true, $ne: null } });

  const results: { referralId: string; referredUserId: string; bookingId: string }[] = [];
  for (const referral of candidates) {
    const firstCompletedBooking = await Booking.findOne({
      $or: [{ assignedDriverIds: referral.referredUserId }, { assignedHamaliIds: referral.referredUserId }],
      status: 'completed',
    })
      .sort({ createdAt: 1 })
      .select('_id')
      .lean();

    if (!firstCompletedBooking) continue;

    referral.status = 'bonus_paid';
    await referral.save();

    results.push({
      referralId: referral._id.toString(),
      referredUserId: referral.referredUserId!.toString(),
      bookingId: firstCompletedBooking._id.toString(),
    });

    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'referral_bonus_paid',
      targetType: 'Referral',
      targetId: referral._id.toString(),
      details: {
        referredUserId: referral.referredUserId!.toString(),
        bonusAmount: referral.bonusAmount,
        bookingId: firstCompletedBooking._id.toString(),
      },
    });
  }

  res.status(200).json({ scanned: candidates.length, paid: results.length, results });
});
