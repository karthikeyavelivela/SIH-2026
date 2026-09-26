import './setup';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Dispute } from '../src/models/Dispute';
import { Federation } from '../src/models/Federation';
import { Mutha } from '../src/models/Mutha';
import { AuditLog } from '../src/models/AuditLog';
import { Notification } from '../src/models/Notification';
import { signAccessToken } from '../src/services/token.service';
import { runSlaEscalations } from '../src/services/disputeRouting.service';

/*
 * P1.5 — disputes go to the level closest to the work, with a 48 h SLA.
 */

const PT: [number, number] = [80.65, 16.5];
let seq = 0;

async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({ name: `R${seq}`, phone: `98990${String(seq).padStart(5, '0')}`, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function hierarchy() {
  const state = await Federation.create({ name: 'AP State', type: 'state', region: 'Andhra Pradesh', registrationNumber: `S${seq++}`, registeredUnderAct: 'Act' });
  const district = await Federation.create({
    name: 'Vijayawada District',
    type: 'district',
    region: 'Vijayawada',
    parentFederationId: state._id,
    registrationNumber: `D${seq++}`,
    registeredUnderAct: 'Act',
  });
  const { agent: stateAdmin } = await agentFor('federation_state_admin', { federationId: state._id });
  const { agent: districtAdmin, user: districtAdminUser } = await agentFor('federation_district_admin', { federationId: district._id });
  return { state, district, stateAdmin, districtAdmin, districtAdminUser };
}

async function society(districtId?: Types.ObjectId) {
  const { agent: leaderAgent, user: leader } = await agentFor('mutha_leader');
  const { user: member } = await agentFor('mutha_member');
  const mutha = await Mutha.create({
    name: `Society ${seq}`,
    leaderId: leader._id,
    memberIds: [member._id],
    inviteCode: `I${seq++}`,
    districtFederationId: districtId,
    affiliationStatus: districtId ? 'affiliated' : 'unaffiliated',
  });
  return { mutha, leader, leaderAgent, member };
}

async function jobFor(customerId: Types.ObjectId, opts: { muthaId?: Types.ObjectId; workerId: Types.ObjectId; region?: string }) {
  return Booking.create({
    customerId,
    type: 'hamali',
    region: opts.region ?? 'Vijayawada',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PT, address: 'A' },
    dropLocation: { type: 'Point', coordinates: PT, address: 'A' },
    requiredHamaliCount: 1,
    assignedHamaliIds: [opts.workerId],
    assignedMuthaId: opts.muthaId,
    status: 'completed',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 330, workerRate: 300, serviceFeePct: 10, serviceFee: 30 },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

async function raise(customerAgent: ReturnType<typeof request.agent>, bookingId: Types.ObjectId) {
  const res = await customerAgent.post('/api/disputes').send({ bookingId: bookingId.toString(), claim: 'The work was left unfinished.' });
  expect(res.status).toBe(201);
  return res.body.dispute as { _id: string; level: string; slaDueAt: string };
}

describe('where a dispute starts', () => {
  it('a society job starts with the society leader, with a 48 h deadline and the full chain recorded', async () => {
    const h = await hierarchy();
    const s = await society(h.district._id);
    const { agent: customer, user: cust } = await agentFor('customer');
    const booking = await jobFor(cust._id, { muthaId: s.mutha._id, workerId: s.member._id });

    const before = Date.now();
    const d = await raise(customer, booking._id);
    expect(d.level).toBe('society');
    const due = new Date(d.slaDueAt).getTime() - before;
    expect(due).toBeGreaterThan(47.9 * 3600_000);
    expect(due).toBeLessThan(48.1 * 3600_000);
    const stored = await Dispute.findById(d._id).lean();
    expect(String(stored!.districtFederationId)).toBe(h.district._id.toString());
    expect(String(stored!.stateFederationId)).toBe(h.state._id.toString());
    expect(await Notification.countDocuments({ userId: s.leader._id, type: 'dispute_assigned' })).toBe(1);
  });

  it('a solo worker job starts at the district federation', async () => {
    const h = await hierarchy();
    const { agent: customer, user: cust } = await agentFor('customer');
    const { user: solo } = await agentFor('hamali_solo');
    const booking = await jobFor(cust._id, { workerId: solo._id });
    const d = await raise(customer, booking._id);
    expect(d.level).toBe('district');
    expect(await Notification.countDocuments({ userId: h.districtAdminUser._id, type: 'dispute_assigned' })).toBe(1);
  });

  it('with no federation anywhere it goes straight to admin, with no deadline', async () => {
    const { agent: customer, user: cust } = await agentFor('customer');
    const { user: solo } = await agentFor('hamali_solo');
    const booking = await jobFor(cust._id, { workerId: solo._id, region: 'Nowhere' });
    const d = await raise(customer, booking._id);
    expect(d.level).toBe('admin');
    expect(d.slaDueAt).toBeUndefined();
  });
});

describe('resolving and escalating', () => {
  it('each level sees only its own queue; escalation walks society → district → state → admin', async () => {
    const h = await hierarchy();
    const s = await society(h.district._id);
    const other = await society(h.district._id);
    const { agent: customer, user: cust } = await agentFor('customer');
    const booking = await jobFor(cust._id, { muthaId: s.mutha._id, workerId: s.member._id });
    const d = await raise(customer, booking._id);

    expect((await s.leaderAgent.get('/api/dispute-queue')).body.disputes).toHaveLength(1);
    expect((await other.leaderAgent.get('/api/dispute-queue')).body.disputes).toHaveLength(0);
    expect((await h.districtAdmin.get('/api/dispute-queue')).body.disputes).toHaveLength(0);
    expect((await other.leaderAgent.get(`/api/dispute-queue/${d._id}`)).status).toBe(404);

    const up1 = await s.leaderAgent.post(`/api/dispute-queue/${d._id}/escalate`).send({ note: 'Needs the federation.' });
    expect(up1.status).toBe(200);
    expect(up1.body.dispute.level).toBe('district');
    expect((await s.leaderAgent.get(`/api/dispute-queue/${d._id}`)).status).toBe(404);
    expect((await h.districtAdmin.get('/api/dispute-queue')).body.disputes).toHaveLength(1);

    const up2 = await h.districtAdmin.patch(`/api/dispute-queue/${d._id}/resolve`).send({ action: 'escalate', note: 'State should decide.' });
    expect(up2.body.dispute.level).toBe('state');
    const up3 = await h.stateAdmin.post(`/api/dispute-queue/${d._id}/escalate`).send({});
    expect(up3.body.dispute.level).toBe('admin');
    expect(up3.body.dispute.slaDueAt).toBeUndefined();

    const history = (await Dispute.findById(d._id).lean())!.levelHistory.map((x) => x.level);
    expect(history).toEqual(['society', 'district', 'state', 'admin']);
    expect(await AuditLog.countDocuments({ action: 'dispute_escalated' })).toBe(3);
  });

  it('a leader resolves at society level; the resolution records the level', async () => {
    const h = await hierarchy();
    const s = await society(h.district._id);
    const { agent: customer, user: cust } = await agentFor('customer');
    const booking = await jobFor(cust._id, { muthaId: s.mutha._id, workerId: s.member._id });
    const d = await raise(customer, booking._id);
    const res = await s.leaderAgent.patch(`/api/dispute-queue/${d._id}/resolve`).send({ action: 'reject', note: 'Photos show the job done.' });
    expect(res.status).toBe(200);
    expect(res.body.dispute).toMatchObject({ status: 'resolved', resolution: { level: 'society', action: 'reject' } });
    const resolvedQueue = await s.leaderAgent.get('/api/dispute-queue?status=resolved');
    expect(resolvedQueue.body.disputes).toHaveLength(1);
  });

  it('an admin can act at any level', async () => {
    const h = await hierarchy();
    const s = await society(h.district._id);
    const { agent: customer, user: cust } = await agentFor('customer');
    const booking = await jobFor(cust._id, { muthaId: s.mutha._id, workerId: s.member._id });
    const d = await raise(customer, booking._id);
    const { agent: admin } = await agentFor('admin');
    const res = await admin.patch(`/api/admin/disputes/${d._id}/resolve`).send({ action: 'partial_refund', note: 'Half back.', amount: 100 });
    expect(res.body.dispute).toMatchObject({ status: 'resolved', resolution: { level: 'society' } });
  });

  it('a society not affiliated anywhere skips straight past levels with nobody to act', async () => {
    const s = await society(undefined);
    const { agent: customer, user: cust } = await agentFor('customer');
    const booking = await jobFor(cust._id, { muthaId: s.mutha._id, workerId: s.member._id, region: 'Nowhere' });
    const d = await raise(customer, booking._id);
    expect(d.level).toBe('society');
    const up = await s.leaderAgent.post(`/api/dispute-queue/${d._id}/escalate`).send({});
    expect(up.body.dispute.level).toBe('admin');
  });
});

describe('the SLA', () => {
  it('a missed deadline escalates by itself, once, as the system', async () => {
    const h = await hierarchy();
    const s = await society(h.district._id);
    const { agent: customer, user: cust } = await agentFor('customer');
    const booking = await jobFor(cust._id, { muthaId: s.mutha._id, workerId: s.member._id });
    const d = await raise(customer, booking._id);

    expect(await runSlaEscalations(new Date(Date.now() + 47 * 3600_000))).toBe(0);
    expect(await runSlaEscalations(new Date(Date.now() + 49 * 3600_000))).toBe(1);
    const after = await Dispute.findById(d._id).lean();
    expect(after!.level).toBe('district');
    expect(after!.levelHistory[1]).toMatchObject({ level: 'district', reason: 'sla_missed' });
    expect(await AuditLog.countDocuments({ action: 'dispute_auto_escalated', actorId: '000000000000000000000000' })).toBe(1);
    // The new deadline is 48 h from the escalation, not from the original.
    expect(await runSlaEscalations(new Date(Date.now() + 50 * 3600_000))).toBe(0);
  });
});

describe('triage for every resolver', () => {
  it('a leader can triage their own society dispute; another leader and a customer cannot', async () => {
    const h = await hierarchy();
    const s = await society(h.district._id);
    const other = await society(h.district._id);
    const { agent: customer, user: cust } = await agentFor('customer');
    const booking = await jobFor(cust._id, { muthaId: s.mutha._id, workerId: s.member._id });
    const d = await raise(customer, booking._id);
    expect((await s.leaderAgent.post(`/api/agents/dispute-triage/${d._id}`)).status).toBe(200);
    expect((await other.leaderAgent.post(`/api/agents/dispute-triage/${d._id}`)).status).toBe(404);
    expect((await customer.post(`/api/agents/dispute-triage/${d._id}`)).status).toBe(403);
  });
});
