import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { Mutha } from '../src/models/Mutha';
import { Booking } from '../src/models/Booking';
import { FareRule } from '../src/models/FareRule';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeCompletedTruckBooking(customerId: string, driverId: string) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    assignedDriverIds: [driverId],
    status: 'completed',
    fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

describe('POST /api/ratings', () => {
  it("lets the customer rate the assigned driver, and updates the driver's aggregate", async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9920000001');
    const { user: driver } = await loginAs('driver', '9920000002');
    const booking = await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());

    const res = await customerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 5, comment: 'Great!' });
    expect(res.status).toBe(201);
    expect(res.body.rating.toUserId).toBe(driver._id.toString());

    const updatedDriver = await User.findById(driver._id);
    expect(updatedDriver?.ratingAvg).toBe(5);
    expect(updatedDriver?.ratingCount).toBe(1);
  });

  it("lets the assigned driver rate the customer back", async () => {
    const { user: customer } = await loginAs('customer', '9920000003');
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9920000004');
    const booking = await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());

    const res = await driverAgent.post('/api/ratings').send({ bookingId: booking._id, score: 4 });
    expect(res.status).toBe(201);
    expect(res.body.rating.toUserId).toBe(customer._id.toString());
  });

  it('averages a second rating correctly (two different customers rating the same driver)', async () => {
    const { agent: customerAAgent, user: customerA } = await loginAs('customer', '9920000005');
    const { user: driver } = await loginAs('driver', '9920000006');
    const bookingA = await makeCompletedTruckBooking(customerA._id.toString(), driver._id.toString());
    const first = await customerAAgent.post('/api/ratings').send({ bookingId: bookingA._id, score: 4 });
    expect(first.status).toBe(201);

    const { agent: customerBAgent, user: customerB } = await loginAs('customer', '9920000007');
    const bookingB = await makeCompletedTruckBooking(customerB._id.toString(), driver._id.toString());
    const second = await customerBAgent.post('/api/ratings').send({ bookingId: bookingB._id, score: 2 });
    expect(second.status).toBe(201);

    const updatedDriver = await User.findById(driver._id);
    expect(updatedDriver?.ratingAvg).toBe(3);
    expect(updatedDriver?.ratingCount).toBe(2);
  });

  it('rejects a duplicate rating for the same booking from the same rater (409)', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9920000008');
    const { user: driver } = await loginAs('driver', '9920000009');
    const booking = await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());
    await customerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 5 });

    const res = await customerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 1 });
    expect(res.status).toBe(409);
  });

  it('rejects rating a booking the caller had no part in (IDOR guard)', async () => {
    const { user: customer } = await loginAs('customer', '9920000010');
    const { user: driver } = await loginAs('driver', '9920000011');
    const booking = await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());
    const { agent: strangerAgent } = await loginAs('customer', '9920000012');

    const res = await strangerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 5 });
    expect(res.status).toBe(403);
  });

  it('rejects rating a booking that is not completed', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9920000013');
    const booking = await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      status: 'searching',
      fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
      statusHistory: [{ status: 'searching', timestamp: new Date() }],
    });
    const res = await customerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 5 });
    expect(res.status).toBe(400);
  });

  it('targets the Mutha (not an individual member) when a combo booking was fulfilled by a group', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9920000014');
    const { user: leader } = await loginAs('mutha_leader', '9920000015');
    const mutha = await Mutha.create({ name: 'G', leaderId: leader._id, memberIds: [], inviteCode: 'RATE01' });
    const booking = await Booking.create({
      customerId: customer._id,
      type: 'hamali',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredHamaliCount: 2,
      assignedMuthaId: mutha._id,
      assignedHamaliIds: [],
      status: 'completed',
      fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 200, total: 200 },
      statusHistory: [{ status: 'completed', timestamp: new Date() }],
    });

    const res = await customerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 5 });
    expect(res.status).toBe(201);
    expect(res.body.rating.toMuthaId).toBe(mutha._id.toString());

    const updatedMutha = await Mutha.findById(mutha._id);
    expect(updatedMutha?.ratingAvg).toBe(5);
  });
});

describe('mandatory-rating gate', () => {
  async function seedFareRule() {
    const admin = await User.create({ name: 'A', phone: '9920099999', passwordHash: 'x', role: 'admin' });
    await FareRule.create({
      region: 'Visakhapatnam',
      category: 'vehicle_small',
      baseFare: 100,
      perKmRate: 10,
      minimumFare: 100,
      surgeMultiplier: 1,
      setByAdminId: admin._id,
      active: true,
    });
  }

  it('blocks a customer with an unrated completed booking from creating a new one', async () => {
    await seedFareRule();
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9920000020');
    const { user: driver } = await loginAs('driver', '9920000021');
    await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());

    const res = await customerAgent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [78.4867, 17.385], address: 'A' },
      dropLocation: { coordinates: [78.5, 17.4], address: 'B' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
    });
    expect(res.status).toBe(403);
    expect(res.body.details?.unratedBookingId).toBeTruthy();
  });

  it('lets the customer book again once they rate the outstanding trip', async () => {
    await seedFareRule();
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9920000022');
    const { user: driver } = await loginAs('driver', '9920000023');
    const booking = await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());
    await customerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 5 });

    const res = await customerAgent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { coordinates: [78.4867, 17.385], address: 'A' },
      dropLocation: { coordinates: [78.5, 17.4], address: 'B' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
    });
    expect(res.status).toBe(201);
  });

  it('blocks a driver with an unrated completed job from accepting a new one', async () => {
    const { user: customer } = await loginAs('customer', '9920000024');
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9920000025');
    await Vehicle.create({
      ownerId: driver._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP04Z0001',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [78.4867, 17.385] },
    });
    await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());

    const newBooking = await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      status: 'searching',
      fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
      statusHistory: [{ status: 'searching', timestamp: new Date() }],
    });

    const res = await driverAgent.post(`/api/requests/${newBooking._id}/accept`);
    expect(res.status).toBe(403);
    expect(res.body.details?.unratedBookingId).toBeTruthy();
  });
});

describe('GET /api/ratings/pending', () => {
  it('reports the unrated booking id when one exists, null otherwise', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9920000026');
    const { user: driver } = await loginAs('driver', '9920000027');
    const booking = await makeCompletedTruckBooking(customer._id.toString(), driver._id.toString());

    const before = await customerAgent.get('/api/ratings/pending');
    expect(before.body.bookingId).toBe(booking._id.toString());

    await customerAgent.post('/api/ratings').send({ bookingId: booking._id, score: 5 });
    const after = await customerAgent.get('/api/ratings/pending');
    expect(after.body.bookingId).toBeNull();
  });
});
