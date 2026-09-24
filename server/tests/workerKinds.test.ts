import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { HamaliProfile, type WorkerKind } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { signAccessToken } from '../src/services/token.service';
import { isEligible } from '../src/services/workerEligibility';
import { ensureServiceCategories } from '../src/services/serviceCategorySeed';
import * as emitters from '../src/realtime/emitters';
import { startHamaliOffers, respondToHamaliOffer } from '../src/realtime/offerEngine';

/*
 * Skilled household workers and farm labourers ride the hamali dispatch
 * pipeline. Before this, nothing in that pipeline read skills: a plumbing
 * job went to whoever was nearest, and a loader could accept an
 * electrician's job. These pin who sees, and who may take, which work.
 */

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function worker(phone: string, workerKind: WorkerKind, skills: string[]) {
  const user = await User.create({ name: 'W', phone, passwordHash: 'x', role: 'hamali_solo' });
  await HamaliProfile.create({
    userId: user._id,
    type: 'solo',
    workerKind,
    skills,
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: PICKUP },
  });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'hamali_solo' })}`);
  return agent;
}

let customerSeq = 0;
async function job(serviceCategorySlug?: string) {
  customerSeq += 1;
  const customer = await User.create({ name: 'C', phone: `98770${String(customerSeq).padStart(5, '0')}`, passwordHash: 'x', role: 'customer' });
  return Booking.create({
    customerId: customer._id,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredHamaliCount: 1,
    status: 'searching',
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
    ...(serviceCategorySlug ? { serviceCategorySlug } : {}),
  });
}

async function feedIds(agent: ReturnType<typeof request.agent>) {
  const res = await agent.get('/api/requests');
  expect(res.status).toBe(200);
  return res.body.requests.map((b: { _id: string }) => b._id);
}

describe('eligibility rule', () => {
  it('matches each kind to its own work', () => {
    const plumber = { workerKind: 'skilled' as const, skills: ['plumbing'] };
    const loader = { workerKind: 'hamali' as const, skills: [] };
    const farm = { workerKind: 'agri' as const, skills: ['agricultural'] };

    expect(isEligible(plumber, ['plumbing'])).toBe(true);
    expect(isEligible(plumber, ['electrical'])).toBe(false);
    expect(isEligible(plumber, [])).toBe(false); // general labour is not a trade job
    expect(isEligible(plumber, null)).toBe(false); // nor is an uncategorised crew job

    expect(isEligible(loader, [])).toBe(true);
    expect(isEligible(loader, null)).toBe(true);
    expect(isEligible(loader, ['plumbing'])).toBe(false);

    expect(isEligible(farm, ['agricultural'])).toBe(true);
    expect(isEligible(farm, [])).toBe(false);
    expect(isEligible(farm, ['plumbing'])).toBe(false);
  });

  it('treats a profile from before kinds existed as a loading worker', () => {
    expect(isEligible({ skills: [] }, null)).toBe(true);
    expect(isEligible({ skills: [] }, ['plumbing'])).toBe(false);
  });
});

describe('open-jobs feed and accept', () => {
  beforeEach(async () => {
    await ensureServiceCategories();
  });

  it('shows each worker only their own kind of job', async () => {
    const plumbing = await job('plumber');
    const electrical = await job('electrician');
    const crew = await job('general_labour');
    const legacyCrew = await job();
    const farm = await job('agri_labour');

    const plumber = await worker('9877100001', 'skilled', ['plumbing']);
    const loader = await worker('9877100002', 'hamali', []);
    const farmer = await worker('9877100003', 'agri', ['agricultural']);

    const p = await feedIds(plumber);
    expect(p).toContain(plumbing._id.toString());
    expect(p).not.toContain(electrical._id.toString());
    expect(p).not.toContain(crew._id.toString());
    expect(p).not.toContain(legacyCrew._id.toString());
    expect(p).not.toContain(farm._id.toString());

    const l = await feedIds(loader);
    expect(l).toEqual(expect.arrayContaining([crew._id.toString(), legacyCrew._id.toString()]));
    expect(l).not.toContain(plumbing._id.toString());
    expect(l).not.toContain(farm._id.toString());

    const f = await feedIds(farmer);
    expect(f).toEqual([farm._id.toString()]);
  });

  it('refuses an accept for work that is not on the profile, and allows the right person', async () => {
    const plumbing = await job('plumber');
    const loader = await worker('9877100011', 'hamali', []);
    const refused = await loader.post(`/api/requests/${plumbing._id}/accept`);
    expect(refused.status).toBe(403);

    const plumber = await worker('9877100012', 'skilled', ['plumbing']);
    const ok = await plumber.post(`/api/requests/${plumbing._id}/accept`);
    expect(ok.status).toBe(200);
  });
});

describe('signing up as a skilled or farm worker', () => {
  it('creates a skilled worker with only real trades, and exposes the kind on /me', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/signup/hamali').send({
      name: 'Ravi',
      phone: '9877200001',
      password: 'Passw0rd!',
      joinType: 'solo',
      workerKind: 'skilled',
      skills: ['plumbing', 'electrical', 'rocket_science'],
    });
    expect(res.status).toBe(201);
    const profile = await HamaliProfile.findOne({ userId: res.body.user._id }).lean();
    expect(profile?.workerKind).toBe('skilled');
    expect(profile?.skills.sort()).toEqual(['electrical', 'plumbing']);

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.workerKind).toBe('skilled');
  });

  it('refuses a skilled worker with no trade — they could never receive a job', async () => {
    const res = await request(app).post('/api/auth/signup/hamali').send({
      name: 'X', phone: '9877200002', password: 'Passw0rd!', joinType: 'solo', workerKind: 'skilled', skills: [],
    });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ phone: '9877200002' })).toBe(0);
  });

  it('creates a farm worker with the farm skill', async () => {
    const res = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Lakshmi', phone: '9877200003', password: 'Passw0rd!', joinType: 'solo', workerKind: 'agri',
    });
    expect(res.status).toBe(201);
    const profile = await HamaliProfile.findOne({ userId: res.body.user._id }).lean();
    expect(profile?.workerKind).toBe('agri');
    expect(profile?.skills).toEqual(['agricultural']);
  });

  it('leaves the original loading-worker signup unchanged', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/api/auth/signup/hamali').send({
      name: 'Old', phone: '9877200004', password: 'Passw0rd!', joinType: 'solo',
    });
    expect(res.status).toBe(201);
    expect((await agent.get('/api/auth/me')).body.user.workerKind).toBe('hamali');
  });
});

describe('category seeding', () => {
  it('creates farm labour at boot, idempotently, without touching an edited category', async () => {
    const first = await ensureServiceCategories();
    expect(first).toBeGreaterThanOrEqual(13);
    await ServiceCategory.updateOne({ slug: 'agri_labour' }, { name: 'Renamed by admin' });
    expect(await ensureServiceCategories()).toBe(0);
    const agri = await ServiceCategory.findOne({ slug: 'agri_labour' }).lean();
    expect(agri?.name).toBe('Renamed by admin');
    expect(agri?.requiredSkills).toEqual(['agricultural']);
  });
});

describe('live offers', () => {
  it('pushes a plumbing job to the plumber, never to the loader standing closer', async () => {
    await ensureServiceCategories();
    const loader = await User.create({ name: 'L', phone: '9877300001', passwordHash: 'x', role: 'hamali_solo' });
    await HamaliProfile.create({
      userId: loader._id, type: 'solo', workerKind: 'hamali', skills: [],
      availabilityStatus: 'online', currentLocation: { type: 'Point', coordinates: PICKUP },
    });
    const plumber = await User.create({ name: 'P', phone: '9877300002', passwordHash: 'x', role: 'hamali_solo' });
    await HamaliProfile.create({
      userId: plumber._id, type: 'solo', workerKind: 'skilled', skills: ['plumbing'],
      availabilityStatus: 'online',
      // Further away than the loader: nearest-first would have picked the loader.
      currentLocation: { type: 'Point', coordinates: [PICKUP[0] + 0.02, PICKUP[1]] },
    });
    const booking = await job('plumber');

    const offered: string[] = [];
    const spy = jest.spyOn(emitters, 'emitBookingOffer').mockImplementation((userId: string) => {
      offered.push(userId);
    });
    try {
      await startHamaliOffers(booking);
      expect(offered).toEqual([plumber._id.toString()]);
      // Declining leaves nobody else eligible: the job stays open rather than
      // falling through to the loader or a loading crew.
      await respondToHamaliOffer(booking._id.toString(), plumber._id.toString(), false);
      expect(offered).toEqual([plumber._id.toString()]);
    } finally {
      spy.mockRestore();
    }
  });
});
