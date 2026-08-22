import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { FareRule } from '../src/models/FareRule';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';
import { releaseDueScheduledBookings } from '../src/services/scheduledBooking.service';

async function loginAsCustomer(phone = '9820000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const customer = await User.create({ name: 'Cust', phone, passwordHash, role: 'customer', region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: customer._id.toString(), role: 'customer' })}`);
  return { agent, customer };
}

async function seedTruckRule() {
  const admin = await User.create({ name: 'A', phone: '9820099999', passwordHash: 'x', role: 'admin' });
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

const bookingBody = {
  type: 'truck',
  region: 'Visakhapatnam',
  cargoDetails: { weightKg: 800 },
  pickupLocation: { coordinates: [83.2185, 17.6868], address: 'Pickup St' },
  dropLocation: { coordinates: [83.3, 17.75], address: 'Drop Ave' },
  requiredVehicles: [{ capacityKg: 1000, count: 1 }],
};

describe('Phase 6 — scheduled booking', () => {
  it('a scheduledFor at least 30 minutes out creates status "scheduled", not "searching"', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer();
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await agent.post('/api/bookings').send({ ...bookingBody, scheduledFor });
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('scheduled');
    expect(res.body.booking.scheduledFor).toBeTruthy();
  });

  it('rejects a scheduledFor less than 30 minutes out', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9820000002');
    const scheduledFor = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const res = await agent.post('/api/bookings').send({ ...bookingBody, scheduledFor });
    expect(res.status).toBe(400);
  });

  it('rejects a scheduledFor more than 14 days out', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9820000003');
    const scheduledFor = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

    const res = await agent.post('/api/bookings').send({ ...bookingBody, scheduledFor });
    expect(res.status).toBe(400);
  });

  it('a scheduled booking is invisible to a driver browsing open requests until it is released', async () => {
    await seedTruckRule();
    const { agent: customerAgent } = await loginAsCustomer('9820000004');
    const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await customerAgent.post('/api/bookings').send({ ...bookingBody, scheduledFor });

    const driverPasswordHash = await bcrypt.hash('Passw0rd!', 12);
    const driver = await User.create({ name: 'D', phone: '9820000005', passwordHash: driverPasswordHash, role: 'driver' });
    const driverAgent = request.agent(app);
    driverAgent.jar.setCookie(`accessToken=${signAccessToken({ id: driver._id.toString(), role: 'driver' })}`);

    const list = await driverAgent.get('/api/requests');
    expect(list.body.requests ?? []).not.toContainEqual(expect.objectContaining({ status: 'scheduled' }));
  });

  it('releaseDueScheduledBookings flips a due booking to "searching" and leaves a not-yet-due one alone', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9820000006');
    const due = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const create = await agent.post('/api/bookings').send({ ...bookingBody, scheduledFor: due });
    const bookingId = create.body.booking._id;

    // Nothing released yet — "now" is still before scheduledFor.
    const releasedNow = await releaseDueScheduledBookings(new Date());
    expect(releasedNow).toBe(0);

    // Simulate time passing past scheduledFor.
    const releasedLater = await releaseDueScheduledBookings(new Date(Date.now() + 61 * 60 * 1000));
    expect(releasedLater).toBe(1);

    const booking = await Booking.findById(bookingId);
    expect(booking!.status).toBe('searching');
    expect(booking!.statusHistory.some((h) => h.status === 'searching')).toBe(true);
  });

  it('a booking created without scheduledFor is unaffected — still starts as "searching" immediately', async () => {
    await seedTruckRule();
    const { agent } = await loginAsCustomer('9820000007');
    const res = await agent.post('/api/bookings').send(bookingBody);
    expect(res.status).toBe(201);
    expect(res.body.booking.status).toBe('searching');
    expect(res.body.booking.scheduledFor).toBeFalsy();
  });
});
