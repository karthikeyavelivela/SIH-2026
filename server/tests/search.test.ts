import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Complaint } from '../src/models/Complaint';
import { Vehicle } from '../src/models/Vehicle';
import { Mutha } from '../src/models/Mutha';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [83.2185, 17.6868];
const DROP: [number, number] = [83.3, 17.7];

async function loginAs(role: string, phone: string, name = 'U') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name, phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function bookingFor(fields: {
  customerId?: string;
  driverId?: string;
  hamaliId?: string;
  pickup: string;
  drop?: string;
}) {
  return Booking.create({
    customerId: fields.customerId ?? (await User.create({ name: 'X', phone: String(Math.random()).slice(2, 12), passwordHash: 'x', role: 'customer' }))._id,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: fields.pickup },
    dropLocation: { type: 'Point', coordinates: DROP, address: fields.drop ?? 'Somewhere Else' },
    requiredHamaliCount: 1,
    assignedDriverIds: fields.driverId ? [fields.driverId] : [],
    assignedHamaliIds: fields.hamaliId ? [fields.hamaliId] : [],
    status: 'completed',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 300 },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

function allHits(body: { groups: { key: string; hits: { title: string; subtitle?: string; path: string }[] }[] }) {
  return body.groups.flatMap((g) => g.hits);
}

describe('global search — scoping', () => {
  it('finds a customer\'s own booking by its address', async () => {
    const { agent, user } = await loginAs('customer', '9910000001');
    await bookingFor({ customerId: user._id.toString(), pickup: 'Gajuwaka Junction' });

    const res = await agent.get('/api/search').query({ q: 'Gajuwaka' });

    expect(res.status).toBe(200);
    expect(allHits(res.body).some((h) => h.title.includes('Gajuwaka Junction'))).toBe(true);
  });

  it('NEVER returns another customer\'s booking — the cross-role isolation test', async () => {
    const { user: victim } = await loginAs('customer', '9910000002', 'Victim');
    await bookingFor({ customerId: victim._id.toString(), pickup: 'Zzyzx Secret Depot' });

    // Every non-admin role, searching for the victim's distinctive address.
    for (const [role, phone] of [
      ['customer', '9910000003'],
      ['driver', '9910000004'],
      ['hamali_solo', '9910000005'],
      ['mutha_leader', '9910000006'],
      ['mutha_member', '9910000007'],
      ['fleet_owner', '9910000008'],
      ['warehouse_hub', '9910000009'],
      ['federation_state_admin', '9910000010'],
    ] as const) {
      const { agent } = await loginAs(role, phone);
      const res = await agent.get('/api/search').query({ q: 'Zzyzx' });
      expect([role, res.status]).toEqual([role, 200]);
      expect([role, JSON.stringify(res.body).includes('Zzyzx')]).toEqual([role, false]);
    }
  });

  it('a worker finds the job they were assigned to, and only that one', async () => {
    const { agent, user: driver } = await loginAs('driver', '9910000011');
    await bookingFor({ driverId: driver._id.toString(), pickup: 'Assigned Yard' });
    await bookingFor({ pickup: 'Assigned Yard' }); // same address, someone else's job

    const res = await agent.get('/api/search').query({ q: 'Assigned' });

    const hits = allHits(res.body);
    expect(hits).toHaveLength(1);
    expect(hits[0].path).toContain('/driver/active-job/');
  });

  it('a society leader finds their own members but not other people', async () => {
    const { agent, user: leader } = await loginAs('mutha_leader', '9910000012');
    const { user: member } = await loginAs('mutha_member', '9910000013', 'Ramesh Kumar');
    const { user: stranger } = await loginAs('mutha_member', '9910000014', 'Ramesh Stranger');
    await Mutha.create({ name: 'S', leaderId: leader._id, memberIds: [member._id], inviteCode: 'SRCH01' });

    const res = await agent.get('/api/search').query({ q: 'Ramesh' });

    const titles = allHits(res.body).map((h) => h.title);
    expect(titles).toContain('Ramesh Kumar');
    expect(titles).not.toContain('Ramesh Stranger');
    void stranger;
  });

  it('a society leader without a society gets nothing rather than everyone', async () => {
    const { agent } = await loginAs('mutha_leader', '9910000015');
    await loginAs('mutha_member', '9910000016', 'Unrelated Person');

    const res = await agent.get('/api/search').query({ q: 'Unrelated' });

    expect(JSON.stringify(res.body)).not.toContain('Unrelated Person');
  });

  it('admin search spans users, because the admin screens already do', async () => {
    const { agent } = await loginAs('admin', '9910000017');
    await loginAs('driver', '9910000018', 'Findable Driver');

    const res = await agent.get('/api/search').query({ q: 'Findable' });

    expect(allHits(res.body).map((h) => h.title)).toContain('Findable Driver');
    expect(res.body.groups.map((g: { key: string }) => g.key)).toContain('people');
  });

  it('a driver searching a person\'s name gets no people group at all', async () => {
    const { agent } = await loginAs('driver', '9910000019');
    await loginAs('customer', '9910000020', 'Findable Customer');

    const res = await agent.get('/api/search').query({ q: 'Findable' });

    expect(res.body.groups.map((g: { key: string }) => g.key)).not.toContain('people');
    expect(JSON.stringify(res.body)).not.toContain('Findable Customer');
  });

  it('finds a complaint by its own words, and only the caller\'s', async () => {
    const { agent, user } = await loginAs('customer', '9910000021');
    const mine = await bookingFor({ customerId: user._id.toString(), pickup: 'Anywhere' });
    const { user: other } = await loginAs('customer', '9910000022');
    const theirs = await bookingFor({ customerId: other._id.toString(), pickup: 'Anywhere' });

    await Complaint.create({ bookingId: mine._id, raisedByUserId: user._id, category: 'damage', description: 'the crate arrived splintered' });
    await Complaint.create({ bookingId: theirs._id, raisedByUserId: other._id, category: 'damage', description: 'their crate arrived splintered too' });

    const res = await agent.get('/api/search').query({ q: 'splintered' });

    const hits = allHits(res.body);
    expect(hits).toHaveLength(1);
    expect(hits[0].title).toContain('the crate arrived splintered');
  });

  it('finds a driver\'s own vehicle by registration', async () => {
    const { agent, user } = await loginAs('driver', '9910000023');
    await Vehicle.create({
      ownerId: user._id,
      type: 'small_truck',
      capacityKg: 1000,
      registrationNumber: 'AP31AB1234',
      currentLocation: { type: 'Point', coordinates: PICKUP },
    });

    const res = await agent.get('/api/search').query({ q: 'AP31' });

    expect(allHits(res.body).map((h) => h.title)).toContain('AP31AB1234');
  });

  it('finds a bookable service and links to its booking screen', async () => {
    const { agent } = await loginAs('customer', '9910000024');
    await ServiceCategory.create({
      name: 'Electrician',
      slug: 'electrician',
      icon: 'PowerIcon',
      accentColor: 'primary',
      pricingUnit: 'per_hour',
      dispatchType: 'hamali',
      defaultDurationMinutes: 60,
      active: true,
    });

    const res = await agent.get('/api/search').query({ q: 'Electrician' });

    const hit = allHits(res.body).find((h) => h.title === 'Electrician');
    expect(hit?.path).toBe('/customer/service/electrician');
  });

  it('groups results rather than returning one flat list', async () => {
    const { agent, user } = await loginAs('customer', '9910000025');
    await bookingFor({ customerId: user._id.toString(), pickup: 'Madhurawada Depot' });
    await ServiceCategory.create({
      name: 'Madhurawada Movers',
      slug: 'general_logistics',
      icon: 'TruckIcon',
      accentColor: 'primary',
      pricingUnit: 'per_km',
      dispatchType: 'truck',
      defaultDurationMinutes: 60,
      active: true,
    });

    const res = await agent.get('/api/search').query({ q: 'Madhurawada' });

    const keys = res.body.groups.map((g: { key: string }) => g.key);
    expect(keys).toContain('bookings');
    expect(keys).toContain('services');
    // Group keys are i18n keys, never display strings — the UI is trilingual.
    expect(keys.every((k: string) => /^[a-z]+$/.test(k))).toBe(true);
  });

  it('matches a partial word before the person has finished typing it', async () => {
    const { agent, user } = await loginAs('customer', '9910000026');
    await bookingFor({ customerId: user._id.toString(), pickup: 'Gajuwaka Junction' });

    const res = await agent.get('/api/search').query({ q: 'Gaju' });

    expect(allHits(res.body).length).toBeGreaterThan(0);
  });

  it('returns nothing for a one-character query instead of scanning', async () => {
    const { agent, user } = await loginAs('customer', '9910000027');
    await bookingFor({ customerId: user._id.toString(), pickup: 'Anywhere At All' });

    const res = await agent.get('/api/search').query({ q: 'a' });

    expect(res.status).toBe(200);
    expect(res.body.groups).toEqual([]);
  });

  it('rejects an unauthenticated search', async () => {
    const res = await request(app).get('/api/search').query({ q: 'anything' });
    expect(res.status).toBe(401);
  });

  it('treats a regex metacharacter as text, not as a pattern', async () => {
    const { agent, user } = await loginAs('customer', '9910000028');
    await bookingFor({ customerId: user._id.toString(), pickup: 'Plot .*' });

    const res = await agent.get('/api/search').query({ q: '.*' });

    // If the input were compiled as a pattern this would match everything.
    expect(res.status).toBe(200);
    expect(allHits(res.body).every((h) => h.title.includes('Plot .*'))).toBe(true);
  });
});
