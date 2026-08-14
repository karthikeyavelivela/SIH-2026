import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { FareRule } from '../src/models/FareRule';

async function loginAsCustomer(phone = '9810000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const customer = await User.create({ name: 'Cust', phone, passwordHash, role: 'customer', region: 'Visakhapatnam' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, password: 'Passw0rd!' });
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
});
