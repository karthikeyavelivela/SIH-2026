import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Booking } from '../src/models/Booking';
import { CommissionRecord } from '../src/models/CommissionRecord';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { MemberShare } from '../src/models/MemberShare';
import { Poll } from '../src/models/Poll';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [83.2185, 17.6868];
const DROP: [number, number] = [83.3, 17.75];

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function makeSocietyWithInProgressJob(commissionRatePct: number, welfareDeductionRatePct: number) {
  const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', '9971000001');
  const member = await User.create({ name: 'Member', phone: '9971000002', passwordHash: 'x', role: 'mutha_member' });
  const mutha = await Mutha.create({
    name: 'Deduction Society',
    leaderId: leader._id,
    memberIds: [member._id],
    inviteCode: 'DEDUCT01',
    commissionRatePct,
    welfareDeductionRatePct,
  });
  const customer = await User.create({ name: 'Cust', phone: '9971000003', passwordHash: 'x', role: 'customer' });
  const booking = await Booking.create({
    customerId: customer._id,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredHamaliCount: 1,
    assignedHamaliIds: [member._id],
    assignedMuthaId: mutha._id,
    status: 'in_progress',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 500, total: 500 },
    statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
  });
  return { leaderAgent, leader, member, mutha, booking };
}

describe('cooperative commission deduction — recorded on real job completion', () => {
  it('a nonzero-rate society deducts commission+welfare, records a real CommissionRecord, and posts real ledger entries', async () => {
    const { leaderAgent, member, mutha, booking } = await makeSocietyWithInProgressJob(10, 5);

    const completeRes = await leaderAgent.post(`/api/requests/${booking._id}/complete`);
    expect(completeRes.status).toBe(200);

    // Fire-and-forget write — poll briefly for it to land rather than
    // asserting immediately after the response returns.
    let record = null;
    for (let i = 0; i < 20 && !record; i++) {
      record = await CommissionRecord.findOne({ bookingId: booking._id, workerId: member._id });
      if (!record) await new Promise((r) => setTimeout(r, 50));
    }
    expect(record).not.toBeNull();
    expect(record!.grossAmount).toBe(500);
    expect(record!.commissionAmount).toBe(50);
    expect(record!.welfareAmount).toBe(25);
    expect(record!.netAmount).toBe(425);

    const commissionEntry = await LedgerEntry.findOne({ type: 'commission', entityType: 'Mutha', entityId: mutha._id });
    expect(commissionEntry).not.toBeNull();
    expect(commissionEntry!.amount).toBe(50);
    const welfareEntry = await LedgerEntry.findOne({ type: 'welfare_fund', entityType: 'Mutha', entityId: mutha._id });
    expect(welfareEntry).not.toBeNull();
    expect(welfareEntry!.amount).toBe(25);
  });

  it("a zero-rate (default) society deducts nothing — no CommissionRecord, no commission ledger entries", async () => {
    const { leaderAgent, member, booking } = await makeSocietyWithInProgressJob(0, 0);
    await leaderAgent.post(`/api/requests/${booking._id}/complete`);
    await new Promise((r) => setTimeout(r, 100));

    const record = await CommissionRecord.findOne({ bookingId: booking._id, workerId: member._id });
    expect(record).toBeNull();
    const commissionEntry = await LedgerEntry.findOne({ type: 'commission' });
    expect(commissionEntry).toBeNull();
  });

  it("the member's own earnings view reflects the real net-of-commission amount, not the gross", async () => {
    const { leaderAgent, member, booking } = await makeSocietyWithInProgressJob(10, 5);
    await leaderAgent.post(`/api/requests/${booking._id}/complete`);
    for (let i = 0; i < 20; i++) {
      if (await CommissionRecord.findOne({ bookingId: booking._id, workerId: member._id })) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(`accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`);
    const res = await memberAgent.get('/api/earnings/me');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(425);
  });
});

describe('member shares (equity)', () => {
  it('leader issues shares, a real equity LedgerEntry is posted, and the member sees their own row', async () => {
    const { agent, user: leader } = await loginAs('mutha_leader', '9971000010');
    const member = await User.create({ name: 'M', phone: '9971000011', passwordHash: 'x', role: 'mutha_member' });
    const mutha = await Mutha.create({ name: 'Share Society', leaderId: leader._id, memberIds: [member._id], inviteCode: 'SHARE010' });

    const issueRes = await agent.post('/api/governance/shares/issue').send({ userId: member._id.toString(), shareCount: 5, shareValue: 100 });
    expect(issueRes.status).toBe(200);
    expect(issueRes.body.share.shareCount).toBe(5);

    const equityEntry = await LedgerEntry.findOne({ type: 'equity', entityId: member._id });
    expect(equityEntry).not.toBeNull();
    expect(equityEntry!.amount).toBe(500);

    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(`accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`);
    const res = await memberAgent.get('/api/governance/shares');
    expect(res.status).toBe(200);
    expect(res.body.shares).toHaveLength(1);
    void mutha;
  });

  it('re-issuing tops up the same row rather than creating a duplicate', async () => {
    const { agent, user: leader } = await loginAs('mutha_leader', '9971000012');
    const member = await User.create({ name: 'M2', phone: '9971000013', passwordHash: 'x', role: 'mutha_member' });
    await Mutha.create({ name: 'Topup Society', leaderId: leader._id, memberIds: [member._id], inviteCode: 'TOPUP012' });

    await agent.post('/api/governance/shares/issue').send({ userId: member._id.toString(), shareCount: 3, shareValue: 100 });
    await agent.post('/api/governance/shares/issue').send({ userId: member._id.toString(), shareCount: 2, shareValue: 100 });

    const rows = await MemberShare.find({ userId: member._id });
    expect(rows).toHaveLength(1);
    expect(rows[0].shareCount).toBe(5);
  });
});

describe('surplus computation and distribution', () => {
  it('computes real surplus from posted commission+welfare ledger entries and distributes it proportional to shares', async () => {
    const { leaderAgent, leader, member, mutha, booking } = await makeSocietyWithInProgressJob(10, 5);
    await leaderAgent.post(`/api/requests/${booking._id}/complete`);
    for (let i = 0; i < 20; i++) {
      if (await LedgerEntry.findOne({ type: 'commission', entityId: mutha._id })) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    await leaderAgent.post('/api/governance/shares/issue').send({ userId: leader._id.toString(), shareCount: 5, shareValue: 100 });
    await leaderAgent.post('/api/governance/shares/issue').send({ userId: member._id.toString(), shareCount: 5, shareValue: 100 });

    const periodStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const periodEnd = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const computeRes = await leaderAgent.post('/api/governance/surplus/compute').send({ periodStart, periodEnd });
    expect(computeRes.status).toBe(201);
    expect(computeRes.body.distribution.totalSurplus).toBe(75); // 50 commission + 25 welfare
    expect(computeRes.body.distribution.lineItems).toHaveLength(2);
    expect(computeRes.body.distribution.perShareAmount).toBe(7.5); // 75 / 10 shares

    const distributeRes = await leaderAgent.post(`/api/governance/surplus/${computeRes.body.distribution._id}/distribute`);
    expect(distributeRes.status).toBe(200);
    expect(distributeRes.body.distribution.status).toBe('distributed');

    const surplusEntries = await LedgerEntry.find({ type: 'surplus' });
    expect(surplusEntries).toHaveLength(2);
    expect(surplusEntries[0].amount).toBeLessThan(0); // a real payout OUT, negative sign convention
  });
});

describe('democratic polls', () => {
  it('a closed leader_election poll really does reassign leadership', async () => {
    const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', '9971000030');
    const member = await User.create({ name: 'Candidate', phone: '9971000031', passwordHash: 'x', role: 'mutha_member' });
    const mutha = await Mutha.create({ name: 'Election Society', leaderId: leader._id, memberIds: [member._id], inviteCode: 'ELECT030' });

    const pollRes = await leaderAgent.post('/api/governance/polls').send({
      type: 'leader_election',
      question: 'Who leads next?',
      options: [{ label: 'Current Leader', value: leader._id.toString() }, { label: 'Candidate', value: member._id.toString() }],
      closesAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(pollRes.status).toBe(201);

    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(`accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`);
    await memberAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/vote`).send({ optionIndex: 1 });

    const closeRes = await leaderAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/close`);
    expect(closeRes.status).toBe(200);
    expect(closeRes.body.consequence.newLeaderId).toBe(member._id.toString());

    const updatedMutha = await Mutha.findById(mutha._id);
    expect(updatedMutha!.leaderId.toString()).toBe(member._id.toString());
    const newLeaderUser = await User.findById(member._id);
    expect(newLeaderUser!.role).toBe('mutha_leader');
    const oldLeaderUser = await User.findById(leader._id);
    expect(oldLeaderUser!.role).toBe('mutha_member');
  });

  it('a member cannot vote twice on the same poll', async () => {
    const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', '9971000032');
    const member = await User.create({ name: 'Voter', phone: '9971000033', passwordHash: 'x', role: 'mutha_member' });
    await Mutha.create({ name: 'DoubleVote Society', leaderId: leader._id, memberIds: [member._id], inviteCode: 'DBLVT032' });

    const pollRes = await leaderAgent.post('/api/governance/polls').send({
      type: 'rate_card',
      question: 'Adopt new rate?',
      options: [{ label: 'Yes', value: JSON.stringify({ commissionRatePct: 5, welfareDeductionRatePct: 2 }) }, { label: 'No', value: JSON.stringify({ commissionRatePct: 0, welfareDeductionRatePct: 0 }) }],
      closesAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(`accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`);
    const first = await memberAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/vote`).send({ optionIndex: 0 });
    expect(first.status).toBe(201);
    const second = await memberAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/vote`).send({ optionIndex: 1 });
    expect(second.status).toBe(409);
  });

  it('a closed rate_card poll applies the winning proposal to the society bye-laws', async () => {
    const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', '9971000034');
    const member = await User.create({ name: 'Voter2', phone: '9971000035', passwordHash: 'x', role: 'mutha_member' });
    const mutha = await Mutha.create({ name: 'RateVote Society', leaderId: leader._id, memberIds: [member._id], inviteCode: 'RATEV034' });

    const pollRes = await leaderAgent.post('/api/governance/polls').send({
      type: 'rate_card',
      question: 'Adopt 7%/3%?',
      options: [
        { label: 'Adopt', value: JSON.stringify({ commissionRatePct: 7, welfareDeductionRatePct: 3 }) },
        { label: 'Keep', value: JSON.stringify({ commissionRatePct: 0, welfareDeductionRatePct: 0 }) },
      ],
      closesAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const memberAgent = request.agent(app);
    memberAgent.jar.setCookie(`accessToken=${signAccessToken({ id: member._id.toString(), role: 'mutha_member' as never })}`);
    await memberAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/vote`).send({ optionIndex: 0 });

    await leaderAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/close`);
    const updated = await Mutha.findById(mutha._id);
    expect(updated!.commissionRatePct).toBe(7);
    expect(updated!.welfareDeductionRatePct).toBe(3);
  });

  it('closing a poll is idempotent-safe against a second close attempt', async () => {
    const { agent: leaderAgent } = await loginAs('mutha_leader', '9971000036');
    await Mutha.create({ name: 'Idem Society', leaderId: (await User.findOne({ phone: '9971000036' }))!._id, memberIds: [], inviteCode: 'IDEM036' });
    const pollRes = await leaderAgent.post('/api/governance/polls').send({
      type: 'rate_card',
      question: 'Q',
      options: [{ label: 'A', value: '{}' }, { label: 'B', value: '{}' }],
      closesAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await leaderAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/close`);
    const second = await leaderAgent.post(`/api/governance/polls/${pollRes.body.poll._id}/close`);
    expect(second.status).toBe(409);
    const polls = await Poll.find({});
    expect(polls).toHaveLength(1);
  });
});
