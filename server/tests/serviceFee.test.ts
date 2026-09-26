import './setup';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Mutha } from '../src/models/Mutha';
import { Federation } from '../src/models/Federation';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { Payment } from '../src/models/Payment';
import { AuditLog } from '../src/models/AuditLog';
import { CommissionRecord } from '../src/models/CommissionRecord';
import { signAccessToken } from '../src/services/token.service';
import { finalizeCompletion } from '../src/services/completion.service';
import { computeSurplus } from '../src/services/governance.service';
import { buildLines } from '../src/services/taxInvoice.service';
import {
  DEFAULT_FEE_SPLIT,
  feeSplitProblems,
  splitServiceFee,
  withServiceFee,
  settleServiceFee,
  workerRateOf,
  repriceWorkerRate,
} from '../src/services/serviceFee.service';

/*
 * P1.1 — the customer pays the worker's rate + 10%, split 5/3/1/1, and the
 * worker keeps 100% of their rate.
 */

const PICKUP: [number, number] = [80.65, 16.5];
const SYSTEM = '000000000000000000000000';

let seq = 0;
async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({ name: `U${seq}`, phone: `98440${String(seq).padStart(5, '0')}`, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function federations() {
  const state = await Federation.create({
    name: 'AP State Federation',
    type: 'state',
    region: 'Andhra Pradesh',
    registrationNumber: `ST-${seq++}`,
    registeredUnderAct: 'AP Cooperative Societies Act',
  });
  const district = await Federation.create({
    name: 'Vijayawada District Federation',
    type: 'district',
    region: 'Vijayawada',
    parentFederationId: state._id,
    registrationNumber: `DT-${seq++}`,
    registeredUnderAct: 'AP Cooperative Societies Act',
  });
  return { state, district };
}

/** A hamali job priced at `rate` with the fee on top, in progress, ready to complete. */
async function inProgressJob(rate: number, opts: { muthaId?: Types.ObjectId; workerIds: Types.ObjectId[]; customerId: Types.ObjectId; region?: string }) {
  const fb = withServiceFee({ baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: rate, total: rate }, DEFAULT_FEE_SPLIT);
  return Booking.create({
    customerId: opts.customerId,
    type: 'hamali',
    region: opts.region ?? 'Vijayawada',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Benz Circle' },
    dropLocation: { type: 'Point', coordinates: PICKUP, address: 'Benz Circle' },
    requiredHamaliCount: opts.workerIds.length,
    assignedHamaliIds: opts.workerIds,
    assignedMuthaId: opts.muthaId,
    status: 'in_progress',
    fareBreakdown: fb,
    statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
  });
}

describe('fee maths', () => {
  it('the default split is valid and adds up', () => {
    expect(feeSplitProblems(DEFAULT_FEE_SPLIT)).toEqual([]);
    expect(feeSplitProblems({ ...DEFAULT_FEE_SPLIT, platformPct: 2 })[0]).toMatch(/add up to 11%/);
    expect(feeSplitProblems({ ...DEFAULT_FEE_SPLIT, societyPct: -1 }).length).toBeGreaterThan(0);
    expect(feeSplitProblems({ feeTotalPct: 60, societyPct: 30, welfarePoolPct: 30, guaranteeReservePct: 0, platformPct: 0 })).toContain(
      'feeTotalPct cannot exceed 50'
    );
  });

  it('adds 10% on top and records the frozen split', () => {
    const fb = withServiceFee({ baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 300 }, DEFAULT_FEE_SPLIT);
    expect(fb).toMatchObject({ workerRate: 300, serviceFeePct: 10, serviceFee: 30, total: 330 });
    expect(fb.feeSplit).toEqual({ societyPct: 5, welfarePoolPct: 3, guaranteeReservePct: 1, platformPct: 1 });
    expect(workerRateOf(fb)).toBe(300);
    expect(workerRateOf({ total: 250 })).toBe(250); // a booking priced before the fee
  });

  it('re-prices a real booking document (a Mongoose subdocument) at its frozen split', () => {
    const fb = withServiceFee({ baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 300 }, { ...DEFAULT_FEE_SPLIT, feeTotalPct: 10 });
    const doc = new Booking({ fareBreakdown: fb });
    const out = repriceWorkerRate(doc.fareBreakdown, 500, { hamaliFare: 500 });
    expect(out).toMatchObject({ workerRate: 500, serviceFee: 50, total: 550, hamaliFare: 500, surgeMultiplier: 1 });
    expect(out.feeSplit).toEqual({ societyPct: 5, welfarePoolPct: 3, guaranteeReservePct: 1, platformPct: 1 });
    // A booking priced before the fee just moves its total.
    const legacy = new Booking({ fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 300 } });
    expect(repriceWorkerRate(legacy.fareBreakdown, 400)).toMatchObject({ total: 400 });
    expect(repriceWorkerRate(legacy.fareBreakdown, 400).serviceFee).toBeUndefined();
  });

  it('splits in integer paise with the remainder to the platform', () => {
    const parts = splitServiceFee(33.33, DEFAULT_FEE_SPLIT);
    expect(parts).toEqual({ society: 16.66, welfarePool: 9.99, guaranteeReserve: 3.33, platform: 3.35 });
    const sumPaise = Math.round((parts.society + parts.welfarePool + parts.guaranteeReserve + parts.platform) * 100);
    expect(sumPaise).toBe(3333);
    expect(splitServiceFee(30, DEFAULT_FEE_SPLIT)).toEqual({ society: 15, welfarePool: 9, guaranteeReserve: 3, platform: 3 });
    expect(splitServiceFee(0, DEFAULT_FEE_SPLIT)).toEqual({ society: 0, welfarePool: 0, guaranteeReserve: 0, platform: 0 });
  });
});

describe('settlement', () => {
  it('solo worker: keeps 100%; society share and welfare go to the district federation; reserve and fee to the platform', async () => {
    const { district } = await federations();
    const { user: customer } = await agentFor('customer');
    const { agent: workerAgent, user: worker } = await agentFor('hamali_solo');
    const booking = await inProgressJob(300, { workerIds: [worker._id], customerId: customer._id });

    const done = await finalizeCompletion(booking._id.toString(), 'customer', { id: customer._id.toString(), role: 'customer' });
    expect(done?.status).toBe('completed');

    const rows = await LedgerEntry.find({ bookingId: booking._id }).lean();
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
    expect(byType.society_share).toMatchObject({ amount: 15, entityType: 'Federation' });
    expect(byType.society_share.entityId.toString()).toBe(district._id.toString());
    expect(byType.welfare_pool_contribution).toMatchObject({ amount: 9, entityType: 'Federation' });
    expect(byType.guarantee_reserve).toMatchObject({ amount: 3, entityType: 'Platform' });
    expect(byType.guarantee_reserve.entityId.toString()).toBe(SYSTEM);
    expect(byType.platform_fee).toMatchObject({ amount: 3, entityType: 'Platform' });
    // Nothing is deducted the old way.
    expect(await LedgerEntry.countDocuments({ type: 'fee' })).toBe(0);

    const earnings = await workerAgent.get('/api/earnings/me');
    expect(earnings.status).toBe(200);
    expect(earnings.body.lines[0]).toMatchObject({ amount: 300, grossAmount: 300, platformFee: 0, platformRatePct: 0 });
    expect(earnings.body.total).toBe(300);
  });

  it('society job: the share goes to the society, welfare to its district pool, and members keep their full rate', async () => {
    const { district } = await federations();
    const { user: customer } = await agentFor('customer');
    const { user: leader } = await agentFor('mutha_leader');
    const { agent: memberAgent, user: member } = await agentFor('mutha_member');
    const mutha = await Mutha.create({
      name: 'Benz Circle Hamali Society',
      leaderId: leader._id,
      memberIds: [member._id],
      inviteCode: `INV${seq++}`,
      districtFederationId: district._id,
      affiliationStatus: 'affiliated',
      commissionRatePct: 6,
      welfareDeductionRatePct: 2,
    });
    const booking = await inProgressJob(1000, { workerIds: [member._id], muthaId: mutha._id, customerId: customer._id, region: 'Guntur' });
    await finalizeCompletion(booking._id.toString(), 'customer', { id: customer._id.toString(), role: 'customer' });

    const share = await LedgerEntry.findOne({ bookingId: booking._id, type: 'society_share' }).lean();
    expect(share).toMatchObject({ amount: 50, entityType: 'Mutha' });
    expect(share!.entityId.toString()).toBe(mutha._id.toString());
    const welfare = await LedgerEntry.findOne({ bookingId: booking._id, type: 'welfare_pool_contribution' }).lean();
    expect(welfare!.entityId.toString()).toBe(district._id.toString());
    // The society's bye-law rates no longer come out of the member's pay.
    expect(await CommissionRecord.countDocuments({ bookingId: booking._id })).toBe(0);

    const earnings = await memberAgent.get('/api/earnings/me');
    expect(earnings.body.lines[0]).toMatchObject({ amount: 1000, grossAmount: 1000, platformFee: 0, societyFee: 0 });

    // The society's share counts as its retained income for surplus.
    const surplus = await computeSurplus(mutha._id.toString(), new Date(Date.now() - 60_000), new Date(Date.now() + 60_000));
    expect(surplus.totalSurplus).toBe(50);
  });

  it('is idempotent: settling twice posts each part once', async () => {
    await federations();
    const { user: customer } = await agentFor('customer');
    const { user: worker } = await agentFor('hamali_solo');
    const booking = await inProgressJob(300, { workerIds: [worker._id], customerId: customer._id });
    const done = await finalizeCompletion(booking._id.toString(), 'customer', { id: customer._id.toString(), role: 'customer' });
    await settleServiceFee(done!);
    await settleServiceFee(done!);
    expect(await LedgerEntry.countDocuments({ bookingId: booking._id })).toBe(4);
  });

  it('a region with no federation holds the society and welfare parts on the platform, labelled', async () => {
    const { user: customer } = await agentFor('customer');
    const { user: worker } = await agentFor('hamali_solo');
    const booking = await inProgressJob(300, { workerIds: [worker._id], customerId: customer._id, region: 'Nowhere' });
    await finalizeCompletion(booking._id.toString(), 'customer', { id: customer._id.toString(), role: 'customer' });
    const share = await LedgerEntry.findOne({ bookingId: booking._id, type: 'society_share' }).lean();
    expect(share!.entityType).toBe('Platform');
    expect(share!.description).toMatch(/no federation for this region/);
  });

  it('a booking priced before the fee keeps the old deduction', async () => {
    const { user: customer } = await agentFor('customer');
    const { agent: workerAgent, user: worker } = await agentFor('hamali_solo');
    const booking = await Booking.create({
      customerId: customer._id,
      type: 'hamali',
      region: 'Vijayawada',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'A' },
      dropLocation: { type: 'Point', coordinates: PICKUP, address: 'A' },
      requiredHamaliCount: 1,
      assignedHamaliIds: [worker._id],
      status: 'in_progress',
      fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 300 },
      statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
    });
    await finalizeCompletion(booking._id.toString(), 'customer', { id: customer._id.toString(), role: 'customer' });
    expect(await LedgerEntry.countDocuments({ bookingId: booking._id })).toBe(0);
    expect(await LedgerEntry.findOne({ type: 'fee', entityId: booking._id }).lean()).toMatchObject({ amount: 3 });
    const earnings = await workerAgent.get('/api/earnings/me');
    expect(earnings.body.lines[0]).toMatchObject({ amount: 297, platformFee: 3 });
  });
});

describe('what the customer pays', () => {
  it('cash on delivery is for the full total including the fee', async () => {
    await federations();
    const { agent: customerAgent, user: customer } = await agentFor('customer');
    const { agent: workerAgent, user: worker } = await agentFor('hamali_solo');
    const booking = await inProgressJob(300, { workerIds: [worker._id], customerId: customer._id });
    await finalizeCompletion(booking._id.toString(), 'customer', { id: customer._id.toString(), role: 'customer' });

    const cod = await customerAgent.post(`/api/payments/${booking._id}/cod`);
    expect(cod.status).toBe(201);
    expect(cod.body.payment.amount).toBe(330);
    const confirm = await workerAgent.post(`/api/payments/${booking._id}/cod/confirm`);
    expect(confirm.status).toBe(200);
    expect((await Payment.findOne({ bookingId: booking._id }).lean())?.status).toBe('success');
  });

  it('the tax invoice lists the worker service and the fee, summing to what was paid', async () => {
    const { user: customer } = await agentFor('customer');
    const { user: worker } = await agentFor('hamali_solo');
    const booking = await inProgressJob(333.33, { workerIds: [worker._id], customerId: customer._id });
    const lines = buildLines(booking);
    expect(lines).toHaveLength(2);
    expect(lines[1].label).toMatch(/service fee \(10%\)/);
    const sum = Math.round(lines.reduce((s, l) => s + l.inclusive, 0) * 100) / 100;
    expect(sum).toBe(booking.fareBreakdown.total);
    expect(lines[0].inclusive).toBe(333.33);
  });

  it('a quote shows the worker rate, the fee and the total', async () => {
    const { agent: customerAgent } = await agentFor('customer');
    const { user: admin } = await agentFor('admin');
    const { FareRule } = await import('../src/models/FareRule');
    await FareRule.create({
      region: 'Vijayawada',
      category: 'hamali',
      baseFare: 300,
      perKmRate: 0,
      minimumFare: 300,
      surgeMultiplier: 1,
      setByAdminId: admin._id,
      active: true,
    });
    const res = await customerAgent.post('/api/bookings/quote').send({
      type: 'hamali',
      region: 'Vijayawada',
      pickupLocation: { coordinates: PICKUP, address: 'A' },
      dropLocation: { coordinates: PICKUP, address: 'A' },
      requiredHamaliCount: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body.fareBreakdown).toMatchObject({ workerRate: 300, serviceFee: 30, total: 330, serviceFeePct: 10 });
  });
});

describe('admin fee settings', () => {
  it('refuses a split that does not add up, applies a valid one forward only, and audits it', async () => {
    const { agent: admin } = await agentFor('admin');
    const bad = await admin.put('/api/admin/platform-fees').send({ ...DEFAULT_FEE_SPLIT, platformPct: 3 });
    expect(bad.status).toBe(400);

    const { user: customer } = await agentFor('customer');
    const { user: worker } = await agentFor('hamali_solo');
    const before = await inProgressJob(300, { workerIds: [worker._id], customerId: customer._id });

    const next = { feeTotalPct: 8, societyPct: 4, welfarePoolPct: 2, guaranteeReservePct: 1, platformPct: 1 };
    const ok = await admin.put('/api/admin/platform-fees').send(next);
    expect(ok.status).toBe(200);
    expect(ok.body.split).toEqual(next);
    expect(await AuditLog.countDocuments({ action: 'platform_fee_split_changed' })).toBe(1);

    // A booking already priced keeps its frozen 10%.
    const again = await Booking.findById(before._id).lean();
    expect(again!.fareBreakdown.serviceFeePct).toBe(10);

    const view = await admin.get('/api/admin/platform-fees');
    expect(view.body.split).toEqual(next);
    expect(view.body.defaultSplit).toEqual(DEFAULT_FEE_SPLIT);
  });

  it('is admin-only', async () => {
    const { agent: manager } = await agentFor('manager', { permissions: ['verify_kyc'] });
    expect((await manager.get('/api/admin/platform-fees')).status).toBe(403);
    const { agent: worker } = await agentFor('hamali_solo');
    expect((await worker.put('/api/admin/platform-fees').send(DEFAULT_FEE_SPLIT)).status).toBe(403);
  });
});
