import './setup';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Complaint } from '../src/models/Complaint';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { FareRule } from '../src/models/FareRule';
import { Mutha } from '../src/models/Mutha';
import { Payout } from '../src/models/Payout';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { Notification } from '../src/models/Notification';
import { TrainingModule } from '../src/models/TrainingModule';
import { TrainingProgress } from '../src/models/TrainingProgress';
import { signAccessToken } from '../src/services/token.service';
import { finalizeCompletion } from '../src/services/completion.service';
import { writeLedgerEntry } from '../src/services/ledger.service';
import { guaranteeReserveBalance } from '../src/services/guarantee.service';
import { DEFAULT_FEE_SPLIT, withServiceFee } from '../src/services/serviceFee.service';

/*
 * P1.3 — the workmanship guarantee loop.
 */

const PT: [number, number] = [80.65, 16.5];
const SYSTEM = '000000000000000000000000';

let seq = 0;
async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({ name: `G${seq}`, phone: `98660${String(seq).padStart(5, '0')}`, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function world() {
  const { user: admin } = await agentFor('admin');
  await ServiceCategory.create({
    name: 'Electrician',
    slug: 'electrician',
    icon: 'bolt',
    accentColor: '#000',
    pricingUnit: 'per_hour',
    requiredSkills: ['electrical'],
    defaultDurationMinutes: 60,
    dispatchType: 'hamali',
    guaranteeEligible: true,
    guaranteePeriodDays: 7,
  });
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
  await TrainingModule.create({
    title: 'Household Electrical Safety Basics',
    description: 'd',
    durationMinutes: 30,
    order: 4,
    forRoles: ['hamali_solo', 'mutha_member'],
    content: 'c',
    tradeArea: 'electrical',
  });
}

async function completedJob(customerId: Types.ObjectId, workerIds: Types.ObjectId[], muthaId?: Types.ObjectId) {
  return Booking.create({
    customerId,
    type: 'hamali',
    region: 'Vijayawada',
    serviceCategorySlug: 'electrician',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PT, address: 'Benz Circle' },
    dropLocation: { type: 'Point', coordinates: PT, address: 'Benz Circle' },
    requiredHamaliCount: workerIds.length,
    assignedHamaliIds: workerIds,
    assignedMuthaId: muthaId,
    status: 'completed',
    fareBreakdown: withServiceFee({ baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 600, total: 600 }, DEFAULT_FEE_SPLIT),
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

async function fundReserve(amount: number) {
  await writeLedgerEntry({ type: 'guarantee_reserve', entityType: 'Platform', entityId: SYSTEM, amount, description: 'test reserve' });
}

async function finishRework(reworkId: string, customerId: string) {
  await Booking.updateOne({ _id: reworkId }, { status: 'in_progress', $push: { statusHistory: { status: 'in_progress', timestamp: new Date() } } });
  return finalizeCompletion(reworkId, 'customer', { id: customerId, role: 'customer' });
}

describe('a claim books the re-work', () => {
  it('creates a linked re-work for the original worker: accepted, no fee, nothing for labour', async () => {
    await world();
    const { agent: customerAgent, user: customer } = await agentFor('customer');
    const { user: worker } = await agentFor('hamali_solo');
    const original = await completedJob(customer._id, [worker._id]);

    const res = await customerAgent.post(`/api/bookings/${original._id}/guarantee-claim`).send({ description: 'The switch sparks again.' });
    expect(res.status).toBe(201);

    const complaint = await Complaint.findById(res.body.complaintId).lean();
    const rework = await Booking.findById(complaint!.reworkBookingId).lean();
    expect(rework).toMatchObject({ status: 'accepted', isRework: true, region: 'Vijayawada' });
    expect(rework!.reworkOfBookingId!.toString()).toBe(original._id.toString());
    expect(rework!.assignedHamaliIds.map(String)).toEqual([worker._id.toString()]);
    expect(rework!.fareBreakdown).toMatchObject({ total: 0, workerRate: 0, serviceFee: 0 });

    const note = await Notification.findOne({ userId: worker._id, type: 'guarantee_rework' }).lean();
    expect(note).toBeTruthy();

    const status = await customerAgent.get(`/api/bookings/${original._id}/guarantee`);
    expect(status.body.guarantee).toMatchObject({ reason: 'already_claimed', reworkBookingId: rework!._id.toString() });
  });
});

describe('materials and labour', () => {
  async function claimed() {
    await world();
    const { agent: customerAgent, user: customer } = await agentFor('customer');
    const { agent: workerAgent, user: worker } = await agentFor('hamali_solo');
    const original = await completedJob(customer._id, [worker._id]);
    const res = await customerAgent.post(`/api/bookings/${original._id}/guarantee-claim`).send({ description: 'Redo it please.' });
    const complaint = await Complaint.findById(res.body.complaintId).lean();
    return { customer, customerAgent, worker, workerAgent, reworkId: complaint!.reworkBookingId!.toString() };
  }

  it('the customer pays only the materials the worker records; no service fee', async () => {
    const { workerAgent, reworkId } = await claimed();
    const res = await workerAgent.post(`/api/rework/${reworkId}/materials`).send({ amount: 150, note: 'New switch' });
    expect(res.status).toBe(200);
    expect(res.body.booking.fareBreakdown).toMatchObject({ total: 150, workerRate: 150, serviceFee: 0 });
    expect(res.body.booking.materialsNote).toBe('New switch');

    const { agent: stranger } = await agentFor('hamali_solo');
    expect((await stranger.post(`/api/rework/${reworkId}/materials`).send({ amount: 10 })).status).toBe(404);
    expect((await workerAgent.post(`/api/rework/${reworkId}/materials`).send({ amount: -5 })).status).toBe(400);
  });

  it('on completion the labour is paid at the base rate from the reserve', async () => {
    const { customer, worker, reworkId } = await claimed();
    await fundReserve(1000);
    const done = await finishRework(reworkId, customer._id.toString());
    expect(done?.status).toBe('completed');

    const payout = await Payout.findOne({ userId: worker._id, source: 'guarantee_rework' }).lean();
    expect(payout).toMatchObject({ amount: 300, status: 'paid' });
    expect(await guaranteeReserveBalance()).toBe(700);
    // A re-work posts no service-fee parts and no old-style commission.
    expect(await LedgerEntry.countDocuments({ bookingId: new Types.ObjectId(reworkId) })).toBe(0);
    expect(await LedgerEntry.countDocuments({ type: 'fee' })).toBe(0);

    // Settling again pays nothing more.
    const again = await Booking.findById(reworkId);
    const { settleRework } = await import('../src/services/guarantee.service');
    await settleRework(again!);
    expect(await Payout.countDocuments({ source: 'guarantee_rework' })).toBe(1);
  });

  it('never overdraws the reserve: too little leaves the payment pending for an admin', async () => {
    const { customer, worker, reworkId } = await claimed();
    await fundReserve(100);
    await finishRework(reworkId, customer._id.toString());
    const payout = await Payout.findOne({ userId: worker._id, source: 'guarantee_rework' }).lean();
    expect(payout).toMatchObject({ amount: 300, status: 'pending' });
    expect(await guaranteeReserveBalance()).toBe(100);
  });

  it('materials cannot be changed after completion', async () => {
    const { customer, workerAgent, reworkId } = await claimed();
    await fundReserve(1000);
    await finishRework(reworkId, customer._id.toString());
    expect((await workerAgent.post(`/api/rework/${reworkId}/materials`).send({ amount: 50 })).status).toBe(400);
  });
});

describe('repeat claims mean support, not penalty', () => {
  it('a second claim in 90 days assigns the trade training and tells the society leader', async () => {
    await world();
    const { agent: customerAgent, user: customer } = await agentFor('customer');
    const { user: leader } = await agentFor('mutha_leader');
    const { user: member } = await agentFor('mutha_member', { rating: 4.8 });
    const mutha = await Mutha.create({ name: 'Benz Society', leaderId: leader._id, memberIds: [member._id], inviteCode: `G${seq++}` });

    const first = await completedJob(customer._id, [member._id], mutha._id);
    await customerAgent.post(`/api/bookings/${first._id}/guarantee-claim`).send({ description: 'First problem.' });
    expect(await TrainingProgress.countDocuments({ userId: member._id })).toBe(0);

    const second = await completedJob(customer._id, [member._id], mutha._id);
    await customerAgent.post(`/api/bookings/${second._id}/guarantee-claim`).send({ description: 'Second problem.' });

    const assigned = await TrainingProgress.findOne({ userId: member._id }).populate('moduleId').lean();
    expect(assigned).toMatchObject({ status: 'in_progress', assignedReason: 'guarantee_claims' });
    expect((assigned!.moduleId as unknown as { tradeArea: string }).tradeArea).toBe('electrical');
    expect(await Notification.countDocuments({ userId: member._id, type: 'training_assigned' })).toBe(1);
    expect(await Notification.countDocuments({ userId: leader._id, type: 'system_alert' })).toBe(1);

    // No penalty: the member's account and rating are untouched.
    const after = await User.findById(member._id).lean();
    expect(after!.accountStatus ?? 'active').toBe('active');
  });
});

describe('leader reassignment', () => {
  it('moves a re-work to another member of the same society only', async () => {
    await world();
    const { agent: customerAgent, user: customer } = await agentFor('customer');
    const { agent: leaderAgent, user: leader } = await agentFor('mutha_leader');
    const { user: a } = await agentFor('mutha_member');
    const { user: b } = await agentFor('mutha_member');
    const { user: outsider } = await agentFor('mutha_member');
    const mutha = await Mutha.create({ name: 'S', leaderId: leader._id, memberIds: [a._id, b._id], inviteCode: `R${seq++}` });
    const original = await completedJob(customer._id, [a._id], mutha._id);
    const res = await customerAgent.post(`/api/bookings/${original._id}/guarantee-claim`).send({ description: 'Please redo.' });
    const reworkId = (await Complaint.findById(res.body.complaintId).lean())!.reworkBookingId!.toString();

    expect((await leaderAgent.patch(`/api/rework/${reworkId}/assign`).send({ memberIds: [outsider._id.toString()] })).status).toBe(400);
    const ok = await leaderAgent.patch(`/api/rework/${reworkId}/assign`).send({ memberIds: [b._id.toString()] });
    expect(ok.status).toBe(200);
    expect(ok.body.booking.assignedHamaliIds).toEqual([b._id.toString()]);

    const { agent: otherLeader } = await agentFor('mutha_leader');
    expect((await otherLeader.patch(`/api/rework/${reworkId}/assign`).send({ memberIds: [b._id.toString()] })).status).toBe(404);
  });
});
