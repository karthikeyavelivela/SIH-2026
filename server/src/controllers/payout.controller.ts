import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Payout } from '../models/Payout';
import { writeAuditLog } from '../services/audit.service';
import { writeLedgerEntry } from '../services/ledger.service';
import { generateEarningsPayouts } from '../services/payoutGeneration.service';
import { createNotification } from '../services/notification.service';

/** GET /api/admin/payouts — approval queue, filterable by status. */
export const listPayouts = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const payouts = await Payout.find(filter).sort({ createdAt: 1 }).populate('userId', 'name phone role');
  res.status(200).json({ payouts });
});

async function decidePayout(
  req: Request,
  res: Response,
  status: 'approved' | 'rejected' | 'paid'
): Promise<void> {
  const payout = await Payout.findById(req.params.id);
  if (!payout) throw new ApiError(404, 'Payout not found');
  if (payout.status !== 'pending' && status !== 'paid') {
    throw new ApiError(409, 'This payout has already been decided');
  }
  if (status === 'paid' && payout.status !== 'approved') {
    throw new ApiError(409, 'Only an approved payout can be marked paid');
  }

  payout.status = status;
  payout.decidedByAdminId = new Types.ObjectId(req.user!.id);
  payout.decidedAt = new Date();
  await payout.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: `payout_${status}`,
    targetType: 'Payout',
    targetId: payout._id.toString(),
    details: { userId: payout.userId.toString(), amount: payout.amount, period: payout.period },
  });

  if (status === 'paid') {
    await writeLedgerEntry({
      type: 'payout',
      entityType: 'Payout',
      entityId: payout._id.toString(),
      amount: -Math.abs(payout.amount),
      description: `Payout for ${payout.period}`,
      status: 'posted',
    });

    // This is the notification half of the money chain proved live during
    // Phase 0.2 — that audit found the payout/ledger writes were real but
    // "the worker receives the notification" was false (no infrastructure
    // existed at all). Same distinction for parametric-insurance-sourced
    // payouts vs regular earnings payouts as the rest of this codebase.
    if (payout.source === 'parametric_insurance') {
      await createNotification(payout.userId.toString(), 'insurance_trigger', { amount: payout.amount });
    } else {
      await createNotification(payout.userId.toString(), 'payout', { amount: payout.amount, period: payout.period });
    }
  }

  res.status(200).json({ payout });
}

export const approvePayout = asyncHandler((req, res) => decidePayout(req, res, 'approved'));
export const rejectPayout = asyncHandler((req, res) => decidePayout(req, res, 'rejected'));
export const markPayoutPaid = asyncHandler((req, res) => decidePayout(req, res, 'paid'));

/**
 * POST /api/admin/payouts/generate — AUDIT_REPORT.md Phase 1.5. Turns
 * computeTrailingEarnings into pending Payout records, one per eligible
 * worker per period, so the approve/reject/mark-paid flow above (already
 * real, previously structurally unreachable — nothing ever created a
 * Payout to act on) has something to review. Idempotent per (userId,
 * period) — see payoutGeneration.service.ts's doc comment.
 */
export const generatePayouts = asyncHandler(async (req: Request, res: Response) => {
  const periodDays = typeof req.body.periodDays === 'number' ? req.body.periodDays : 30;
  const result = await generateEarningsPayouts(periodDays);

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'payouts_generated',
    targetType: 'PayoutGenerationRun',
    // No single Payout document is "the" target of a batch run — a fresh
    // id stands for this run itself, rather than reusing the admin's own
    // id (which would misleadingly read as "targeted themselves").
    targetId: new Types.ObjectId().toString(),
    details: { periodDays, ...result },
  });

  res.status(200).json({ result });
});
