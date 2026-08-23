import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { FareRule } from '../src/models/FareRule';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function seedHamaliRule() {
  const admin = await User.create({ name: 'A', phone: '9990500001', passwordHash: 'x', role: 'admin' });
  return FareRule.create({
    region: 'Visakhapatnam',
    category: 'hamali',
    baseFare: 200,
    perKmRate: 0,
    minimumFare: 300,
    surgeMultiplier: 1.0,
    setByAdminId: admin._id,
    active: true,
  });
}

async function makeElectricianCategory() {
  return ServiceCategory.create({
    name: 'Electrician',
    slug: 'electrician',
    icon: 'PowerIcon',
    accentColor: 'secondary',
    pricingUnit: 'per_hour',
    requiredSkills: ['electrical'],
    requiresVehicle: false,
    requiresMaterials: true,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    dispatchType: 'hamali',
    active: true,
  });
}

describe('GET /api/service-categories', () => {
  it('returns only active categories', async () => {
    await makeElectricianCategory();
    await ServiceCategory.create({
      name: 'Inactive Trade', slug: 'inactive_trade', icon: 'BoxIcon', accentColor: 'primary',
      pricingUnit: 'per_job', defaultDurationMinutes: 30, dispatchType: 'hamali', active: false,
    });
    const { agent } = await loginAs('customer', '9990500002');
    const res = await agent.get('/api/service-categories');
    expect(res.status).toBe(200);
    expect(res.body.categories).toHaveLength(1);
    expect(res.body.categories[0].slug).toBe('electrician');
  });

  it('requires authentication', async () => {
    const res = await request(app).get('/api/service-categories');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/service-categories', () => {
  it('admin creates a real category', async () => {
    const { agent } = await loginAs('admin', '9990500003');
    const res = await agent.post('/api/admin/service-categories').send({
      name: 'Caregiver', slug: 'caregiver', icon: 'UsersIcon', accentColor: 'secondary',
      pricingUnit: 'per_hour', requiredSkills: ['caregiving'], defaultDurationMinutes: 240, dispatchType: 'hamali',
    });
    expect(res.status).toBe(201);
    expect(res.body.category.slug).toBe('caregiver');
  });

  it('rejects a duplicate slug', async () => {
    const { agent } = await loginAs('admin', '9990500004');
    await makeElectricianCategory();
    const res = await agent.post('/api/admin/service-categories').send({
      name: 'Electrician Again', slug: 'electrician', icon: 'PowerIcon', accentColor: 'secondary',
      pricingUnit: 'per_hour', defaultDurationMinutes: 60, dispatchType: 'hamali',
    });
    expect(res.status).toBe(409);
  });

  it('is admin-only', async () => {
    const { agent } = await loginAs('customer', '9990500005');
    const res = await agent.post('/api/admin/service-categories').send({
      name: 'X', slug: 'x', icon: 'BoxIcon', accentColor: 'primary', pricingUnit: 'per_job', defaultDurationMinutes: 30, dispatchType: 'hamali',
    });
    expect(res.status).toBe(403);
  });
});

describe('booking creation with a service category', () => {
  it("derives the real dispatch type from the category, ignoring whatever `type` the client sent alongside it", async () => {
    await seedHamaliRule();
    await makeElectricianCategory();
    const { agent } = await loginAs('customer', '9990500006');

    const res = await agent.post('/api/bookings').send({
      type: 'truck', // deliberately wrong — the category (hamali dispatch) must win
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredHamaliCount: 1,
      serviceCategorySlug: 'electrician',
    });
    expect(res.status).toBe(201);
    expect(res.body.booking.type).toBe('hamali');
    expect(res.body.booking.serviceCategorySlug).toBe('electrician');

    const stored = await Booking.findById(res.body.booking._id);
    expect(stored!.type).toBe('hamali');
  });

  it('rejects an unknown or inactive service category slug', async () => {
    await seedHamaliRule();
    const { agent } = await loginAs('customer', '9990500007');
    const res = await agent.post('/api/bookings').send({
      type: 'hamali',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredHamaliCount: 1,
      serviceCategorySlug: 'nonexistent_trade',
    });
    expect(res.status).toBe(400);
  });

  it('a category-less booking behaves exactly as before (unchanged)', async () => {
    await seedHamaliRule();
    const { agent } = await loginAs('customer', '9990500008');
    const res = await agent.post('/api/bookings').send({
      type: 'hamali',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredHamaliCount: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.booking.serviceCategorySlug).toBeUndefined();
  });
});

describe('hamali skill profile — trade skills', () => {
  it('accepts a real trade skill (electrical) alongside cargo-handling ones', async () => {
    const { agent, user } = await loginAs('hamali_solo', '9990500009');
    const { HamaliProfile } = await import('../src/models/HamaliProfile');
    await HamaliProfile.create({ userId: user._id, type: 'solo', availabilityStatus: 'offline' });

    const res = await agent.patch('/api/hamali-profile/me').send({ skills: ['electrical', 'plumbing'] });
    expect(res.status).toBe(200);
    expect(res.body.skills).toEqual(['electrical', 'plumbing']);
  });

  it('rejects an unknown skill', async () => {
    const { agent, user } = await loginAs('hamali_solo', '9990500010');
    const { HamaliProfile } = await import('../src/models/HamaliProfile');
    await HamaliProfile.create({ userId: user._id, type: 'solo', availabilityStatus: 'offline' });

    const res = await agent.patch('/api/hamali-profile/me').send({ skills: ['not_a_real_skill'] });
    expect(res.status).toBe(400);
  });
});
