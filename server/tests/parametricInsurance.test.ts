import './setup';
import { User } from '../src/models/User';
import { InsurancePlan } from '../src/models/InsurancePlan';
import { InsurancePolicy } from '../src/models/InsurancePolicy';
import { ParametricTrigger, IParametricTrigger } from '../src/models/ParametricTrigger';
import { Payout } from '../src/models/Payout';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { HydratedDocument } from 'mongoose';
import {
  checkParametricTrigger,
  MAX_PARAMETRIC_PAYOUT_PER_WORKER_PER_PERIOD,
  MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY,
} from '../src/services/parametricInsurance.service';
import { env } from '../src/config/env';

async function makeDriverWithPolicy(phone: string) {
  const driver = await User.create({ name: 'D', phone, passwordHash: 'x', role: 'driver' });
  const plan = await InsurancePlan.create({
    name: 'Income Protection',
    type: 'parametric',
    category: 'work_compensation',
    coverageAmount: 2500,
    description: 'x',
    forRoles: ['driver'],
    premium: 100,
  });
  const policy = await InsurancePolicy.create({
    userId: driver._id,
    planId: plan._id,
    status: 'active',
    startDate: new Date(),
    endDate: new Date(Date.now() + 365 * 86_400_000),
  });
  return { driver, policy };
}

async function makeTrigger(policyId: string, overrides: Partial<IParametricTrigger> = {}) {
  return ParametricTrigger.create({
    policyId,
    condition: 'earnings_below_threshold',
    thresholdValue: 8000,
    periodDays: 30,
    payoutAmount: 2500,
    active: true,
    events: [],
    ...overrides,
  }) as unknown as Promise<HydratedDocument<IParametricTrigger>>;
}

describe('checkParametricTrigger — real disbursement (AUDIT_REPORT.md Phase 1.4)', () => {
  afterEach(() => {
    // A few tests below flip this to exercise the kill switch — restore it
    // so it never leaks into a later test file/run.
    env.PARAMETRIC_PAYOUTS_ENABLED = true;
  });

  it('does not trigger, and creates no Payout, when the worker earns at or above the threshold', async () => {
    const { driver, policy } = await makeDriverWithPolicy('9840000001');
    const trigger = await makeTrigger(policy._id.toString(), { thresholdValue: 0 }); // earns >= 0 always true, never below

    const result = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');
    expect(result.triggered).toBe(false);
    expect(result.payoutId).toBeUndefined();

    const payouts = await Payout.find({ userId: driver._id });
    expect(payouts).toHaveLength(0);
  });

  it('fires, creates a real Payout (paid) and a matching LedgerEntry, when earnings are below threshold', async () => {
    const { driver, policy } = await makeDriverWithPolicy('9840000002');
    const trigger = await makeTrigger(policy._id.toString(), { thresholdValue: 999_999 }); // no bookings -> 0 earnings, always below

    const result = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');
    expect(result.triggered).toBe(true);
    expect(result.paidAt).toBeDefined();
    expect(result.payoutFailureReason).toBeUndefined();
    expect(result.payoutId).toBeTruthy();

    const payout = await Payout.findById(result.payoutId);
    expect(payout).not.toBeNull();
    expect(payout!.status).toBe('paid');
    expect(payout!.source).toBe('parametric_insurance');
    expect(payout!.amount).toBe(2500);

    const ledgerEntries = await LedgerEntry.find({ entityType: 'Payout', entityId: payout!._id });
    expect(ledgerEntries).toHaveLength(1);
    expect(ledgerEntries[0].amount).toBe(-2500);
    expect(ledgerEntries[0].status).toBe('posted');
  });

  it('is idempotent: calling twice for the same period produces exactly one Payout, not two', async () => {
    const { driver, policy } = await makeDriverWithPolicy('9840000003');
    const trigger = await makeTrigger(policy._id.toString(), { thresholdValue: 999_999 });

    const first = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');
    // Re-fetch the trigger the same way the real caller would (a fresh
    // dashboard poll re-fetches from the DB) rather than reusing the
    // in-memory mutated document, to prove the idempotency is real and not
    // an artifact of reusing the same object reference.
    const refetched = (await ParametricTrigger.findById(trigger._id))!;
    const second = await checkParametricTrigger(refetched, driver._id.toString(), 'driver');

    expect(second.fromExistingEvent).toBe(true);
    expect(second.payoutId).toBe(first.payoutId);

    const payouts = await Payout.find({ userId: driver._id, source: 'parametric_insurance' });
    expect(payouts).toHaveLength(1);
    const ledgerEntries = await LedgerEntry.find({ entityType: 'Payout', entityId: payouts[0]._id });
    expect(ledgerEntries).toHaveLength(1);
  });

  it('never evaluates days_unable_to_work as triggered (no real data source — honest false, not fabricated)', async () => {
    const { driver, policy } = await makeDriverWithPolicy('9840000004');
    const trigger = await makeTrigger(policy._id.toString(), { condition: 'days_unable_to_work', thresholdValue: 1 });

    const result = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');
    expect(result.triggered).toBe(false);
    expect(result.actualValue).toBe(0);
    expect(result.payoutId).toBeUndefined();
  });

  it('kill switch: still creates a Payout and still records triggered:true, but leaves it pending with a reason, no LedgerEntry', async () => {
    env.PARAMETRIC_PAYOUTS_ENABLED = false;
    const { driver, policy } = await makeDriverWithPolicy('9840000005');
    const trigger = await makeTrigger(policy._id.toString(), { thresholdValue: 999_999 });

    const result = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');
    expect(result.triggered).toBe(true);
    expect(result.paidAt).toBeUndefined();
    expect(result.payoutFailureReason).toMatch(/kill switch/i);

    const payout = await Payout.findById(result.payoutId);
    expect(payout!.status).toBe('pending');
    const ledgerEntries = await LedgerEntry.find({ entityType: 'Payout', entityId: payout!._id });
    expect(ledgerEntries).toHaveLength(0);
  });

  it('per-worker-per-period cap: a payout that would push this worker over the cap is left pending, not auto-paid', async () => {
    const { driver, policy } = await makeDriverWithPolicy('9840000006');
    // Simulate an already-paid parametric payout this period that's most
    // of the way to the per-worker cap.
    await Payout.create({
      userId: driver._id,
      amount: MAX_PARAMETRIC_PAYOUT_PER_WORKER_PER_PERIOD - 1000,
      period: '2026-08',
      status: 'paid',
      source: 'parametric_insurance',
    });
    const trigger = await makeTrigger(policy._id.toString(), { thresholdValue: 999_999, payoutAmount: 2500 }); // 2500 > remaining 1000 headroom

    const result = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');
    expect(result.triggered).toBe(true);
    expect(result.paidAt).toBeUndefined();
    expect(result.payoutFailureReason).toMatch(/per-worker/i);
  });

  it('global daily cap: a payout that would push the platform-wide daily total over the cap is left pending', async () => {
    const { driver, policy } = await makeDriverWithPolicy('9840000007');
    // A different worker already consumed most of today's global cap.
    const otherDriver = await User.create({ name: 'O', phone: '9840000008', passwordHash: 'x', role: 'driver' });
    await Payout.create({
      userId: otherDriver._id,
      amount: MAX_PARAMETRIC_PAYOUT_GLOBAL_PER_DAY - 1000,
      period: '2026-08',
      status: 'paid',
      source: 'parametric_insurance',
    });
    const trigger = await makeTrigger(policy._id.toString(), { thresholdValue: 999_999, payoutAmount: 2500 });

    const result = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');
    expect(result.triggered).toBe(true);
    expect(result.paidAt).toBeUndefined();
    expect(result.payoutFailureReason).toMatch(/daily/i);
  });

  it('a pending (capped/kill-switched) parametric payout shows up in the ordinary admin payout queue', async () => {
    env.PARAMETRIC_PAYOUTS_ENABLED = false;
    const { driver, policy } = await makeDriverWithPolicy('9840000009');
    const trigger = await makeTrigger(policy._id.toString(), { thresholdValue: 999_999 });
    const result = await checkParametricTrigger(trigger, driver._id.toString(), 'driver');

    const pending = await Payout.find({ status: 'pending' });
    expect(pending.map((p) => p._id.toString())).toContain(result.payoutId);
  });
});
