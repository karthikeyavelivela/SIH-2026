import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Contract } from '../src/models/Contract';
import { Federation } from '../src/models/Federation';
import { Mutha } from '../src/models/Mutha';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { signAccessToken } from '../src/services/token.service';
import { clearStateForRegionCache, ensureWageFloors } from '../src/services/wageFloor.service';
import { generateVisits, occurrencesBetween } from '../src/services/contract.service';
import { finalizeCompletion } from '../src/services/completion.service';
import { findUnratedCompletedBooking } from '../src/services/ratingGate.service';

/*
 * P1.6 — institutions and bulk contracts.
 */

const PT: [number, number] = [80.65, 16.5];
const MONDAY = new Date('2026-10-05T03:00:00Z'); // 08:30 IST, Monday 5 Oct 2026
let seq = 0;

async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({ name: `K${seq}`, phone: `97110${String(seq).padStart(5, '0')}`, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function world() {
  await User.create({ name: 'Root', phone: '9711099999', passwordHash: 'x', role: 'admin' });
  const state = await Federation.create({ name: 'AP State', type: 'state', region: 'Andhra Pradesh', registrationNumber: `S${seq++}`, registeredUnderAct: 'Act' });
  const district = await Federation.create({
    name: 'Vijayawada District',
    type: 'district',
    region: 'Vijayawada',
    parentFederationId: state._id,
    registrationNumber: `D${seq++}`,
    registeredUnderAct: 'Act',
  });
  clearStateForRegionCache();
  await ensureWageFloors();
  const { agent: leaderAgent, user: leader } = await agentFor('mutha_leader');
  const mutha = await Mutha.create({
    name: 'Benz Circle Society',
    leaderId: leader._id,
    memberIds: [],
    inviteCode: `C${seq++}`,
    districtFederationId: district._id,
    affiliationStatus: 'affiliated',
  });
  const { agent: school, user: schoolUser } = await agentFor('customer');
  const setUp = await school.put('/api/contracts/institution-profile').send({
    accountType: 'institution',
    institutionType: 'school',
    orgName: 'Sri Vidya School',
    gstin: '37ABCDE1234F1Z5',
  });
  expect(setUp.status).toBe(200);
  const { agent: districtAdmin } = await agentFor('federation_district_admin', { federationId: district._id });
  return { mutha, leader, leaderAgent, school, schoolUser, district, districtAdmin };
}

function proposal(muthaId: string, rate: number) {
  return {
    muthaId,
    categorySlug: 'cleaner',
    scope: 'Classroom and corridor cleaning after school.',
    kind: 'recurring',
    schedule: { startDate: '2026-10-05', frequency: 'weekly', daysOfWeek: [1, 4], time: '16:00', durationHours: 4 },
    workersPerVisit: 2,
    ratePerWorkerPerVisit: rate,
    region: 'Vijayawada',
    location: { coordinates: PT, address: 'Sri Vidya School, Benz Circle' },
  };
}

describe('schedules', () => {
  it('weekly, monthly and one-off dates in a window', () => {
    const weekly = { kind: 'recurring' as const, schedule: { startDate: new Date('2026-10-01'), frequency: 'weekly' as const, daysOfWeek: [1, 4], time: '09:00', durationHours: 2 } };
    expect(occurrencesBetween(weekly, '2026-10-05', '2026-10-12')).toEqual(['2026-10-05', '2026-10-08']);
    const monthly = { kind: 'recurring' as const, schedule: { startDate: new Date('2026-10-01'), frequency: 'monthly' as const, dayOfMonth: 15, time: '09:00', durationHours: 2 } };
    expect(occurrencesBetween(monthly, '2026-10-01', '2026-12-01')).toEqual(['2026-10-15', '2026-11-15']);
    const once = { kind: 'one_off' as const, schedule: { startDate: new Date('2026-10-07T00:00:00+05:30'), time: '09:00', durationHours: 2 } };
    expect(occurrencesBetween(once, '2026-10-05', '2026-10-12')).toEqual(['2026-10-07']);
    const ended = { ...weekly, schedule: { ...weekly.schedule, endDate: new Date('2026-10-06T00:00:00+05:30') } };
    expect(occurrencesBetween(ended, '2026-10-05', '2026-10-12')).toEqual(['2026-10-05']);
  });
});

describe('the contract lifecycle', () => {
  it('a household cannot propose; an institution can, but never below the wage floor', async () => {
    const w = await world();
    const { agent: household } = await agentFor('customer');
    expect((await household.post('/api/contracts').send(proposal(w.mutha._id.toString(), 400))).status).toBe(403);

    // ₹200 for 4 hours is ₹50 an hour, under the seeded AP unskilled floor.
    const check = await w.school.post('/api/contracts/check-rate').send({ categorySlug: 'cleaner', region: 'Vijayawada', ratePerWorkerPerVisit: 200, schedule: { durationHours: 4 } });
    expect(check.body.ok).toBe(false);
    const low = await w.school.post('/api/contracts').send(proposal(w.mutha._id.toString(), 200));
    expect(low.status).toBe(422);
    expect(low.body.error).toMatch(/₹50 an hour, below the/);
  });

  it('propose → counter → accept counter → visits generated, assigned to the society, priced with the fee', async () => {
    const w = await world();
    const proposed = await w.school.post('/api/contracts').send(proposal(w.mutha._id.toString(), 400));
    expect(proposed.status).toBe(201);
    const id = proposed.body.contract._id;

    const countered = await w.leaderAgent.post(`/api/contracts/${id}/leader`).send({ action: 'counter', ratePerWorkerPerVisit: 450, note: 'Four hours is a long shift.' });
    expect(countered.body.contract.status).toBe('countered');
    const accepted = await w.school.post(`/api/contracts/${id}/institution`).send({ action: 'accept_counter' });
    expect(accepted.body.contract).toMatchObject({ status: 'active', ratePerWorkerPerVisit: 450 });

    // Accepting already generates against the real clock, so how many are new
    // here depends on today's date; the total and idempotency do not.
    await generateVisits(MONDAY);
    expect(await Booking.countDocuments({ contractId: id })).toBe(2);
    expect(await generateVisits(MONDAY)).toBe(0); // idempotent
    const visits = await Booking.find({ contractId: id }).sort({ contractVisitDate: 1 }).lean();
    expect(visits.map((v) => v.contractVisitDate)).toEqual(['2026-10-05', '2026-10-08']);
    expect(visits[0]).toMatchObject({ status: 'accepted', requiredHamaliCount: 2 });
    expect(String(visits[0].assignedMuthaId)).toBe(w.mutha._id.toString());
    expect(visits[0].fareBreakdown).toMatchObject({ workerRate: 900, serviceFee: 90, total: 990 });
    expect(new Date(visits[0].scheduledFor!).toISOString()).toBe('2026-10-05T10:30:00.000Z'); // 16:00 IST
  });

  it('a completed visit settles like any job and shows on the monthly statement and invoice', async () => {
    const w = await world();
    const proposed = await w.school.post('/api/contracts').send(proposal(w.mutha._id.toString(), 400));
    const id = proposed.body.contract._id;
    await w.leaderAgent.post(`/api/contracts/${id}/leader`).send({ action: 'accept' });
    await generateVisits(MONDAY);
    const visit = await Booking.findOne({ contractId: id, contractVisitDate: '2026-10-05' });
    await Booking.updateOne({ _id: visit!._id }, { status: 'in_progress' });
    await finalizeCompletion(visit!._id.toString(), 'customer', { id: w.schoolUser._id.toString(), role: 'customer' });

    // The fee parts post exactly as P1.1 — the society share to the society.
    const share = await LedgerEntry.findOne({ bookingId: visit!._id, type: 'society_share' }).lean();
    expect(String(share!.entityId)).toBe(w.mutha._id.toString());

    const st = await w.school.get(`/api/contracts/${id}/statement?month=2026-10`);
    expect(st.status).toBe(200);
    expect(st.body.lines).toHaveLength(1);
    expect(st.body.lines[0]).toMatchObject({ date: '2026-10-05', workerRate: 800, serviceFee: 80, total: 880 });
    expect(st.body.lines[0].feeParts).toEqual({ society: 40, welfarePool: 24, guaranteeReserve: 8, platform: 8 });
    expect(st.body.totals).toMatchObject({ visits: 1, total: 880 });
    expect(st.body.pendingVisits).toBe(1);

    const pdf = await w.school.get(`/api/contracts/${id}/invoice?month=2026-10`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    expect((await w.school.get(`/api/contracts/${id}/statement?month=2026-13`)).status).toBe(400);
  });

  it('contract visits never block the institution behind the rating gate', async () => {
    const w = await world();
    const proposed = await w.school.post('/api/contracts').send(proposal(w.mutha._id.toString(), 400));
    await w.leaderAgent.post(`/api/contracts/${proposed.body.contract._id}/leader`).send({ action: 'accept' });
    await generateVisits(MONDAY);
    await Booking.updateMany({ contractId: proposed.body.contract._id }, { status: 'completed' });
    expect(await findUnratedCompletedBooking(w.schoolUser._id.toString())).toBeNull();
  });

  it('pause stops new visits; resume brings them back', async () => {
    const w = await world();
    const proposed = await w.school.post('/api/contracts').send(proposal(w.mutha._id.toString(), 400));
    const id = proposed.body.contract._id;
    await w.leaderAgent.post(`/api/contracts/${id}/leader`).send({ action: 'accept' });
    await w.school.post(`/api/contracts/${id}/institution`).send({ action: 'pause' });
    expect(await generateVisits(MONDAY)).toBe(0);
    await w.school.post(`/api/contracts/${id}/institution`).send({ action: 'resume' });
    await generateVisits(MONDAY);
    expect(await Booking.countDocuments({ contractId: id })).toBe(2);
    expect((await Contract.findById(id).lean())!.history.map((h) => h.status)).toEqual(['proposed', 'active', 'paused', 'active']);
  });
});

describe('who can see what', () => {
  it('parties and the federation above see a contract; others get 404', async () => {
    const w = await world();
    const proposed = await w.school.post('/api/contracts').send(proposal(w.mutha._id.toString(), 400));
    const id = proposed.body.contract._id;

    expect((await w.leaderAgent.get(`/api/contracts/${id}`)).status).toBe(200);
    expect((await w.districtAdmin.get(`/api/contracts/${id}`)).status).toBe(200);
    expect((await w.districtAdmin.get('/api/contracts/federation')).body.contracts).toHaveLength(1);

    const { agent: otherSchool } = await agentFor('customer');
    expect((await otherSchool.get(`/api/contracts/${id}`)).status).toBe(404);
    const { agent: otherLeader } = await agentFor('mutha_leader');
    expect((await otherLeader.get(`/api/contracts/${id}`)).status).toBe(404);
    expect((await otherLeader.post(`/api/contracts/${id}/leader`).send({ action: 'accept' })).status).toBe(404);

    const mine = await w.leaderAgent.get('/api/contracts/mine');
    expect(mine.body.contracts).toHaveLength(1);
  });

  it('rejects a malformed GSTIN', async () => {
    const { agent } = await agentFor('customer');
    const res = await agent.put('/api/contracts/institution-profile').send({ accountType: 'institution', institutionType: 'office', orgName: 'Acme', gstin: 'NOTAGSTIN' });
    expect(res.status).toBe(400);
  });
});
