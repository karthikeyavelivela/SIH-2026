import './setup';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Federation } from '../src/models/Federation';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';
import { AllocationLog } from '../src/models/AllocationLog';
import { signAccessToken } from '../src/services/token.service';

const mutableEnv = env as unknown as Record<string, unknown>;
const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  mutableEnv.ML_SERVICE_URL = undefined;
  mutableEnv.ML_SERVICE_TOKEN = undefined;
});

const cookie = (u: { _id: Types.ObjectId; role: string }) => [`accessToken=${signAccessToken({ id: u._id.toString(), role: u.role as never })}`];
const pt = (lng: number, lat: number) => ({ type: 'Point' as const, coordinates: [lng, lat], address: 'a' });

async function world() {
  const leader = await User.create({ name: 'Lead', phone: '9400000001', passwordHash: 'x', role: 'mutha_leader', accountStatus: 'active' });
  const mutha = await Mutha.create({ name: 'S', leaderId: leader._id, memberIds: [], inviteCode: 'ABC123', region: 'Guntur' });
  const members = [];
  // m0 is close and has worked a lot lately; m1 is close and rested; m2 is far away.
  const spots: [number, number][] = [[80.65, 16.51], [80.651, 16.511], [83.2, 17.7]];
  for (let i = 0; i < 3; i++) {
    const u = await User.create({ name: `M${i}`, phone: `940000001${i}`, passwordHash: 'x', role: 'mutha_member', accountStatus: 'active' });
    await HamaliProfile.create({
      userId: u._id,
      type: 'mutha_member',
      muthaId: mutha._id,
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: spots[i] },
    });
    members.push(u);
  }
  mutha.memberIds = members.map((m) => m._id);
  await mutha.save();
  const customer = await User.create({ name: 'C', phone: '9400000002', passwordHash: 'x', role: 'customer', accountStatus: 'active' });
  return { leader, mutha, members, customer };
}

function job(customerId: Types.ObjectId, extra: Record<string, unknown> = {}) {
  return Booking.create({
    customerId,
    type: 'hamali',
    region: 'Guntur',
    cargoDetails: { weightKg: 0, description: 'x' },
    pickupLocation: pt(80.65, 16.51),
    dropLocation: pt(80.65, 16.52),
    requiredHamaliCount: 2,
    status: 'searching',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 1000, total: 1000 },
    ...extra,
  });
}

// Give m0 work on earlier days so the fairness input is real.
async function busy(memberId: Types.ObjectId, customerId: Types.ObjectId, days: number) {
  for (let d = 1; d <= days; d++) {
    await job(customerId, { status: 'completed', assignedHamaliIds: [memberId], scheduledFor: new Date(Date.now() - d * 86_400_000) });
  }
}

describe('P2.2 crew recommendation (rules path)', () => {
  it('suggests the nearest members, prefers the rested one, says why, and labels the source', async () => {
    const w = await world();
    await busy(w.members[0]._id, w.customer._id, 5);
    const b = await job(w.customer._id, { requiredHamaliCount: 1 });
    const res = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.leader)).send({ bookingId: b._id.toString() });
    expect(res.status).toBe(200);
    const rec = res.body.recommendation;
    expect(rec.source).toBe('rules');
    expect(rec.fallbackReason).toBe('not_configured');
    expect(rec.assigned).toHaveLength(1);
    expect(rec.assigned[0].name).toBe('M1'); // equally near as M0 but with fewer recent days
    expect(rec.assigned[0].reasons).toEqual(expect.arrayContaining(['available', 'near']));
    expect(rec.alternates.map((a: { name: string }) => a.name)).toEqual(expect.arrayContaining(['M0']));
    expect(await AllocationLog.countDocuments({ bookingId: b._id })).toBe(1);
  });

  it('is for society leaders only, and only for jobs they can crew', async () => {
    const w = await world();
    const b = await job(w.customer._id);
    const asCustomer = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.customer)).send({ bookingId: b._id.toString() });
    expect(asCustomer.status).toBe(403);
    const done = await job(w.customer._id, { status: 'completed' });
    const r = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.leader)).send({ bookingId: done._id.toString() });
    expect(r.status).toBe(403);
    const bad = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.leader)).send({ bookingId: 'nope' });
    expect(bad.status).toBe(400);
  });

  it('refuses when the job already has its full crew', async () => {
    const w = await world();
    const b = await job(w.customer._id, { requiredHamaliCount: 1, assignedHamaliIds: [w.members[0]._id], assignedMuthaId: w.mutha._id, status: 'accepted' });
    const r = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.leader)).send({ bookingId: b._id.toString() });
    expect(r.status).toBe(400);
  });
});

describe('P2.2 crew recommendation (ML path)', () => {
  it('uses the solver’s assignment when the service answers', async () => {
    const w = await world();
    const b = await job(w.customer._id, { requiredHamaliCount: 1 });
    mutableEnv.ML_SERVICE_URL = 'http://ml.test';
    mutableEnv.ML_SERVICE_TOKEN = 'test-token-0123456789';
    const pick = w.members[2]._id.toString();
    global.fetch = jest.fn(async () =>
      new Response(
        JSON.stringify({
          status: 'OPTIMAL',
          spread_days: 0,
          slots: [{ slot_id: b._id.toString(), date: '2026-10-05', needed: 1, unmet: 0, assigned: [{ member_id: pick, reasons: ['skill_match', 'available'], distance_km: null }], alternates: [] }],
        }),
        { status: 200 }
      )
    ) as unknown as typeof fetch;
    const res = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.leader)).send({ bookingId: b._id.toString() });
    expect(res.body.recommendation.source).toBe('ml');
    expect(res.body.recommendation.assigned[0]).toMatchObject({ memberId: pick, name: 'M2' });
  });

  it('falls back to rules when the service errors', async () => {
    const w = await world();
    const b = await job(w.customer._id, { requiredHamaliCount: 1 });
    mutableEnv.ML_SERVICE_URL = 'http://ml.test';
    mutableEnv.ML_SERVICE_TOKEN = 'test-token-0123456789';
    global.fetch = jest.fn(async () => new Response('{}', { status: 500 })) as unknown as typeof fetch;
    const res = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.leader)).send({ bookingId: b._id.toString() });
    expect(res.body.recommendation).toMatchObject({ source: 'rules', fallbackReason: 'http_500' });
  });
});

describe('P2.2 recommendation versus the final choice', () => {
  async function recommendFor(w: Awaited<ReturnType<typeof world>>) {
    const b = await job(w.customer._id, {
      requiredHamaliCount: 2,
      assignedHamaliIds: [w.members[2]._id],
      assignedMuthaId: w.mutha._id,
      status: 'accepted',
    });
    const res = await request(app).post('/api/mutha/allocation/recommend').set('Cookie', cookie(w.leader)).send({ bookingId: b._id.toString() });
    return { b, rec: res.body.recommendation };
  }

  it('records followed:true when the leader takes the recommendation', async () => {
    const w = await world();
    const { b, rec } = await recommendFor(w);
    const take = rec.assigned[0].memberId as string;
    const r = await request(app)
      .post(`/api/mutha/jobs/${b._id}/assign`)
      .set('Cookie', cookie(w.leader))
      .send({ memberIds: [w.members[2]._id.toString(), take] });
    expect(r.status).toBe(200);
    const log = await AllocationLog.findOne({ bookingId: b._id }).lean();
    expect(log!.followed).toBe(true);
    expect(log!.addedCount).toBe(1 - 1 + 0); // 0: the pre-assigned member was never part of the suggestion
  });

  it('records the swap when the leader chooses someone else', async () => {
    const w = await world();
    const { b, rec } = await recommendFor(w);
    const recommended = rec.assigned[0].memberId as string;
    const other = [w.members[0], w.members[1]].find((m) => m._id.toString() !== recommended)!;
    await request(app)
      .post(`/api/mutha/jobs/${b._id}/assign`)
      .set('Cookie', cookie(w.leader))
      .send({ memberIds: [w.members[2]._id.toString(), other._id.toString()] });
    const log = await AllocationLog.findOne({ bookingId: b._id }).lean();
    expect(log!.followed).toBe(false);
    expect(log!.removedCount).toBe(1);
    expect(log!.addedCount).toBe(1);
  });
});

describe('P2.2 federation fairness panel', () => {
  it('reports the real spread of work within each society in scope', async () => {
    const w = await world();
    const fed = await Federation.create({
      name: 'D', type: 'district', region: 'Guntur', registrationNumber: 'R1', registeredUnderAct: 'AP Cooperative Societies Act 1964', contactDetails: {},
    });
    await Mutha.updateOne({ _id: w.mutha._id }, { districtFederationId: fed._id, affiliationStatus: 'affiliated' });
    const admin = await User.create({ name: 'FA', phone: '9400000003', passwordHash: 'x', role: 'federation_district_admin', federationId: fed._id, accountStatus: 'active' });
    await busy(w.members[0]._id, w.customer._id, 4); // m0 worked 4 days, the others none

    const res = await request(app).get('/api/federation/fairness').set('Cookie', cookie(admin));
    expect(res.status).toBe(200);
    const s = res.body.societies[0];
    expect(s).toMatchObject({ members: 3, min: 0, max: 4, spread: 4, membersWithNoWork: 2 });
    expect(s.distribution).toEqual([0, 0, 4]);
    expect(res.body.recommendations).toEqual({ decided: 0, followed: 0, fromMl: 0 });

    const asLeader = await request(app).get('/api/federation/fairness').set('Cookie', cookie(w.leader));
    expect(asLeader.status).toBe(403);
  });
});
