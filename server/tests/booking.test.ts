import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { FareRule } from '../src/models/FareRule';
import { signAccessToken } from '../src/services/token.service';

// Mints the accessToken cookie directly rather than calling the real
// POST /api/auth/login. This file is about booking authorization/business
// logic, not the login flow itself (covered by auth.test.ts) — going
// through the real endpoint burns against the shared per-file authLimiter
// bucket (5/min, module-scoped per test file) on every single test, which
// breaks once a file has more than 5 tests each needing their own login
// (see the same fix already applied in admin.test.ts).
async function loginAsCustomer(phone = '9810000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const customer = await User.create({ name: 'Cust', phone, passwordHash, role: 'customer', region: 'Visakhapatnam' });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: customer._id.toString(), role: 'customer' });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, customer };
}

async function seedTruckRule() {
  const admin = await User.create({ name: 'A', phone: '9810099999', passwordHash: 'x', role: 'admin' });
  return FareRule.create({
    region: 'Visakhapatnam',
    category: 'vehicle_small',
    baseFare: 150,
    perKmRate: 18,
    minimumFare: 250,
    surgeMultiplier: 1.0,
    setByAdminId: admin._id,
    active: true,
  });
}

async function seedHamaliRule() {
  const admin = await User.create({ name: 'A2', phone: '9810099998', passwordHash: 'x', role: 'admin' });
  return FareRule.create({
    region: 'Visakhapatnam',
    category: 'hamali',
    baseFare: 100,
    perKmRate: 0,
    minimumFare: 300,
    surgeMultiplier: 1.0,
    setByAdminId: admin._id,
    active: true,
  });
}

describe('booking lifecycle', () => {
  it('creates a truck booking with a server-computed fareBreakdown, lists it in history, fetches it, and cancels it', async () => {
    await seedTruckRule();
    const { agent, customer } = await loginAsCustomer();

    const create = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 800, description: 'Furniture' },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup St' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop Ave' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    expect(create.status).toBe(201);
    expect(create.body.booking.status).toBe('searching');
    expect(create.body.booking.fareBreakdown.total).toBeGreaterThan(0);
    expect(create.body.booking.customerId).toBe(customer._id.toString());
    const bookingId = create.body.booking._id;

    const history = await agent.get('/api/bookings');
    expect(history.status).toBe(200);
    expect(history.body.bookings.length).toBe(1);

    const detail = await agent.get(`/api/bookings/${bookingId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.booking._id).toBe(bookingId);

    const cancel = await agent.patch(`/api/bookings/${bookingId}/cancel`);
    expect(cancel.status).toBe(200);
    expect(cancel.body.booking.status).toBe('cancelled');
  });

  it('ignores any client-supplied fareBreakdown/status/customerId in the create payload', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9810000002');

    const res = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 800 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
      fareBreakdown: { total: 1 },
      status: 'completed',
      customerId: '000000000000000000000000',
    });
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('searching');
    expect(res.body.booking.fareBreakdown.total).not.toBe(1);
  });

  it('one customer cannot view or cancel another customer\'s booking', async () => {
    await seedTruckRule();
    const { agent: agentA } = await loginAsCustomer('9810000003');
    const createRes = await agentA.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    const bookingId = createRes.body.booking._id;

    const { agent: agentB } = await loginAsCustomer('9810000004');
    const getRes = await agentB.get(`/api/bookings/${bookingId}`);
    expect(getRes.status).toBe(404);

    const cancelRes = await agentB.patch(`/api/bookings/${bookingId}/cancel`);
    expect(cancelRes.status).toBe(404);
  });

  it('rejects booking creation with no matching active FareRule for the region/category', async () => {
    const { agent } = await loginAsCustomer('9810000005');
    const res = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'NoSuchRegion',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    expect(res.status).toBe(422);
  });

  it('creates a hamali booking end to end (type=hamali, no vehicle component)', async () => {
    await seedHamaliRule();
    const { agent } = await loginAsCustomer('9810000006');

    const res = await agent.post('/api/bookings').send({
      type: 'hamali',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 200 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredHamaliCount: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.booking.fareBreakdown.hamaliFare).toBeGreaterThan(0);
    expect(res.body.booking.fareBreakdown.total).toBe(res.body.booking.fareBreakdown.hamaliFare);
  });

  it('creates a combo booking end to end (both vehicle and hamali components present)', async () => {
    await seedTruckRule();
    await seedHamaliRule();
    const { agent } = await loginAsCustomer('9810000007');

    const res = await agent.post('/api/bookings').send({
      type: 'combo',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 800 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
      requiredHamaliCount: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.booking.fareBreakdown.hamaliFare).toBeGreaterThan(0);
    expect(res.body.booking.fareBreakdown.baseFare).toBeGreaterThan(0);
  });

  it('rejects a hamali booking with no requiredHamaliCount (would create a real, matchable, zero-fare booking)', async () => {
    await seedHamaliRule();
    const { agent } = await loginAsCustomer('9810000008');

    const res = await agent.post('/api/bookings').send({
      type: 'hamali',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 200 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      // requiredHamaliCount omitted entirely
    });
    expect(res.status).toBe(400);
  });

  it('rejects a truck booking with a malformed (null) capacityKg instead of silently miscategorizing it', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9810000009');

    const res = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: null, count: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a second cancel attempt on an already-cancelled booking', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9810000010');

    const create = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    const bookingId = create.body.booking._id;

    const firstCancel = await agent.patch(`/api/bookings/${bookingId}/cancel`);
    expect(firstCancel.status).toBe(200);

    const secondCancel = await agent.patch(`/api/bookings/${bookingId}/cancel`);
    expect(secondCancel.status).toBe(400);
  });
});

describe('booking quote', () => {
  it('returns the same fareBreakdown a create with identical inputs would produce, without persisting anything', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9810000011');

    const payload = {
      type: 'truck' as const,
      region: 'Visakhapatnam',
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup St' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop Ave' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    };

    const quote = await agent.post('/api/bookings/quote').send(payload);
    expect(quote.status).toBe(200);
    expect(quote.body.fareBreakdown.total).toBeGreaterThan(0);
    expect(quote.body.distanceKm).toBeGreaterThan(0);

    // Nothing written — a customer who abandons the form after quoting
    // must not see a phantom booking in their history.
    const history = await agent.get('/api/bookings');
    expect(history.body.bookings.length).toBe(0);

    const create = await agent.post('/api/bookings').send({
      ...payload,
      cargoDetails: { weightKg: 800 },
    });
    expect(create.status).toBe(201);
    expect(create.body.booking.fareBreakdown).toEqual(quote.body.fareBreakdown);
    expect(create.body.booking.distanceKm).toBe(quote.body.distanceKm);
  });

  it('quotes a combo booking (vehicle + hamali) itemized', async () => {
    await seedTruckRule();
    await seedHamaliRule();
    const { agent } = await loginAsCustomer('9810000012');

    const res = await agent.post('/api/bookings/quote').send({
      type: 'combo',
      region: 'Visakhapatnam',
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
      requiredHamaliCount: 2,
    });
    expect(res.status).toBe(200);
    expect(res.body.fareBreakdown.hamaliFare).toBeGreaterThan(0);
    expect(res.body.fareBreakdown.baseFare).toBeGreaterThan(0);
  });

  it('rejects a quote with no active FareRule for the region/category (422), same as create', async () => {
    const { agent } = await loginAsCustomer('9810000013');
    const res = await agent.post('/api/bookings/quote').send({
      type: 'truck',
      region: 'NoSuchRegion',
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    expect(res.status).toBe(422);
  });

  it('rejects a quote missing pickupLocation.coordinates (400) before ever touching pricing logic', async () => {
    const { agent } = await loginAsCustomer('9810000014');
    const res = await agent.post('/api/bookings/quote').send({
      type: 'truck',
      region: 'Visakhapatnam',
      pickupLocation: { address: 'Pickup, no coordinates' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('rejects a quote for hamali type with requiredHamaliCount of 0 (400)', async () => {
    await seedHamaliRule();
    const { agent } = await loginAsCustomer('9810000015');
    const res = await agent.post('/api/bookings/quote').send({
      type: 'hamali',
      region: 'Visakhapatnam',
      pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup' },
      dropLocation: { coordinates: [83.3, 17.75], address: 'Drop' },
      requiredHamaliCount: 0,
    });
    expect(res.status).toBe(400);
  });
});
