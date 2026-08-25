import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Checkpoint } from '../src/models/Checkpoint';
import { HaltEvent } from '../src/models/HaltEvent';
import { FraudSignal } from '../src/models/FraudSignal';
import { Notification } from '../src/models/Notification';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function makeInProgressBooking(customerId: string, driverId: string) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [83.2185, 17.6868], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [83.3, 17.75], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    assignedDriverIds: [driverId],
    status: 'in_progress',
    fareBreakdown: { baseFare: 500, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: 500 },
    statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
  });
}

describe('checkpoint routes', () => {
  it('GET /api/checkpoints/nearby returns checkpoints within radius', async () => {
    await Checkpoint.create({
      name: 'Aganampudi Toll Plaza',
      location: { type: 'Point', coordinates: [83.15, 17.75] },
      type: 'toll_plaza',
      cctvAvailable: true,
      securityRating: 4,
      corridor: 'NH16',
    });
    const { agent } = await loginAs('customer', '9970000001');
    const res = await agent.get('/api/checkpoints/nearby?lat=17.75&lng=83.15&radiusKm=10');
    expect(res.status).toBe(200);
    expect(res.body.checkpoints).toHaveLength(1);
  });

  it('GET /api/checkpoints/route-suggestions ranks on-route CCTV checkpoints first', async () => {
    // Roughly on the Visakhapatnam -> Srikakulam line.
    await Checkpoint.create({
      name: 'On Route', location: { type: 'Point', coordinates: [83.5, 18.0] },
      type: 'toll_plaza', cctvAvailable: true, securityRating: 4, corridor: 'NH16',
    });
    await Checkpoint.create({
      name: 'Far Off Route', location: { type: 'Point', coordinates: [85.5, 19.5] },
      type: 'toll_plaza', cctvAvailable: true, securityRating: 4, corridor: 'NH16',
    });
    const { agent } = await loginAs('customer', '9970000002');
    const res = await agent.get(
      '/api/checkpoints/route-suggestions?pickupLat=17.6868&pickupLng=83.2185&dropLat=18.3&dropLng=83.9'
    );
    expect(res.status).toBe(200);
    expect(res.body.suggestions.some((s: { name: string }) => s.name === 'On Route')).toBe(true);
    expect(res.body.suggestions.some((s: { name: string }) => s.name === 'Far Off Route')).toBe(false);
  });

  it('driver can check in and check out of a halt on their own in-progress booking', async () => {
    const { user: customer } = await loginAs('customer', '9970000003');
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9970000004');
    const booking = await makeInProgressBooking(customer._id.toString(), driver._id.toString());

    const checkIn = await driverAgent.post('/api/checkpoints/halts/check-in').send({
      bookingId: booking._id.toString(), lat: 17.7, lng: 83.25,
    });
    expect(checkIn.status).toBe(201);

    const checkOut = await driverAgent.patch(`/api/checkpoints/halts/${checkIn.body.halt._id}/check-out`).send({
      sealIntact: true, odometerReading: 12345,
    });
    expect(checkOut.status).toBe(200);
    expect(checkOut.body.halt.sealIntact).toBe(true);
    expect(checkOut.body.halt.departureTime).toBeTruthy();
  });

  it('rejects check-in from a driver not assigned to the booking', async () => {
    const { user: customer } = await loginAs('customer', '9970000005');
    const { user: driver } = await loginAs('driver', '9970000006');
    const { agent: strangerAgent } = await loginAs('driver', '9970000007');
    const booking = await makeInProgressBooking(customer._id.toString(), driver._id.toString());

    const res = await strangerAgent.post('/api/checkpoints/halts/check-in').send({
      bookingId: booking._id.toString(), lat: 17.7, lng: 83.25,
    });
    expect(res.status).toBe(403);
  });

  it('a long halt with no matched checkpoint raises a fraud signal and notifies the customer', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9970000008');
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9970000009');
    const booking = await makeInProgressBooking(customer._id.toString(), driver._id.toString());

    // No Checkpoint exists anywhere near this point, so check-in leaves checkpointId unset.
    const checkIn = await driverAgent.post('/api/checkpoints/halts/check-in').send({
      bookingId: booking._id.toString(), lat: 17.7, lng: 83.25,
    });
    const halt = await HaltEvent.findById(checkIn.body.halt._id);
    // Backdate arrival so the check-out sees a >=20-minute duration without the test actually sleeping.
    halt!.arrivalTime = new Date(Date.now() - 25 * 60 * 1000);
    await halt!.save();

    const checkOut = await driverAgent.patch(`/api/checkpoints/halts/${halt!._id}/check-out`).send({});
    expect(checkOut.status).toBe(200);

    const signals = await FraudSignal.find({ userId: driver._id, detectorType: 'unplanned_halt_deviation' });
    expect(signals).toHaveLength(1);

    const notifications = await Notification.find({ userId: customer._id, type: 'unplanned_halt' });
    expect(notifications).toHaveLength(1);

    void customerAgent; // login only needed to create the user in this test
  });

  it('a short halt with no checkpoint does NOT raise a fraud signal', async () => {
    const { user: customer } = await loginAs('customer', '9970000010');
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9970000011');
    const booking = await makeInProgressBooking(customer._id.toString(), driver._id.toString());

    const checkIn = await driverAgent.post('/api/checkpoints/halts/check-in').send({
      bookingId: booking._id.toString(), lat: 17.7, lng: 83.25,
    });
    const checkOut = await driverAgent.patch(`/api/checkpoints/halts/${checkIn.body.halt._id}/check-out`).send({});
    expect(checkOut.status).toBe(200);

    const signals = await FraudSignal.find({ userId: driver._id, detectorType: 'unplanned_halt_deviation' });
    expect(signals).toHaveLength(0);
  });

  it('customer and assigned driver can read the chain-of-custody timeline; an unrelated user cannot', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9970000012');
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9970000013');
    const { agent: strangerAgent } = await loginAs('customer', '9970000014');
    const booking = await makeInProgressBooking(customer._id.toString(), driver._id.toString());
    await driverAgent.post('/api/checkpoints/halts/check-in').send({ bookingId: booking._id.toString(), lat: 17.7, lng: 83.25 });

    const asCustomer = await customerAgent.get(`/api/checkpoints/booking/${booking._id}/halts`);
    expect(asCustomer.status).toBe(200);
    expect(asCustomer.body.halts).toHaveLength(1);

    const asDriver = await driverAgent.get(`/api/checkpoints/booking/${booking._id}/halts`);
    expect(asDriver.status).toBe(200);

    const asStranger = await strangerAgent.get(`/api/checkpoints/booking/${booking._id}/halts`);
    expect(asStranger.status).toBe(403);
  });

  it('admin can create a real checkpoint', async () => {
    const { agent } = await loginAs('admin', '9970000015');
    const res = await agent.post('/api/admin/checkpoints').send({
      name: 'Test Plaza', lat: 17.5, lng: 83.0, type: 'toll_plaza', cctvAvailable: true, securityRating: 4, corridor: 'NH16',
    });
    expect(res.status).toBe(201);
    expect(res.body.checkpoint.name).toBe('Test Plaza');
  });

  it('is admin-only for checkpoint creation', async () => {
    const { agent } = await loginAs('customer', '9970000016');
    const res = await agent.post('/api/admin/checkpoints').send({
      name: 'X', lat: 17.5, lng: 83.0, type: 'toll_plaza',
    });
    expect(res.status).toBe(403);
  });
});
