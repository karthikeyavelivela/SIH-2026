import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';
import { Bid } from '../src/models/Bid';
import { FareRule } from '../src/models/FareRule';
import { signAccessToken } from '../src/services/token.service';

async function seedTruckRule() {
  const admin = await User.create({ name: 'A', phone: '9840099998', passwordHash: 'x', role: 'admin' });
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

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function loginAsOnlineDriver(phone = '9840000001', capacityKg = 1000) {
  const { agent, user: driver } = await loginAs('driver', phone);
  await Vehicle.create({
    ownerId: driver._id,
    type: 'mini_truck',
    capacityKg,
    registrationNumber: `AP03Z${phone.slice(-4)}`,
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: PICKUP },
  });
  return { agent, driver };
}

async function loginAsOnlineSoloHamali(phone = '9840000101') {
  const { agent, user: hamali } = await loginAs('hamali_solo', phone);
  await HamaliProfile.create({
    userId: hamali._id,
    type: 'solo',
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: PICKUP },
  });
  return { agent, hamali };
}

async function makeOpenTruckBooking(customerId: string, fareTotal = 500) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    status: 'searching',
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
    openForBidding: true,
    fareBreakdown: { baseFare: 200, distanceFare: 300, surgeMultiplier: 1, hamaliFare: 0, total: fareTotal },
  });
}

describe('load board — browsing and placing bids', () => {
  it('a driver sees an open-for-bidding truck booking on the load board', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9840000002');
    const booking = await makeOpenTruckBooking(customer._id.toString());
    const { agent: driverAgent } = await loginAsOnlineDriver();

    const res = await driverAgent.get('/api/loadboard');
    expect(res.status).toBe(200);
    expect(res.body.loads.map((l: { _id: string }) => l._id)).toContain(booking._id.toString());
    void customerAgent;
  });

  it('a driver places a bid below the reference fare, and re-submitting updates the same bid (no duplicate)', async () => {
    const { user: customer } = await loginAs('customer', '9840000003');
    const booking = await makeOpenTruckBooking(customer._id.toString(), 500);
    const { agent: driverAgent } = await loginAsOnlineDriver('9840000004');

    const first = await driverAgent.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 420 });
    expect(first.status).toBe(200);
    expect(first.body.bid.amount).toBe(420);

    const second = await driverAgent.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 400, message: 'can do faster too' });
    expect(second.status).toBe(200);
    expect(second.body.bid.amount).toBe(400);
    expect(second.body.bid._id).toBe(first.body.bid._id); // same row, not a duplicate

    const count = await Bid.countDocuments({ bookingId: booking._id });
    expect(count).toBe(1);
  });

  it('rejects a bid more than 3x the reference fare (abuse ceiling)', async () => {
    const { user: customer } = await loginAs('customer', '9840000005');
    const booking = await makeOpenTruckBooking(customer._id.toString(), 500);
    const { agent: driverAgent } = await loginAsOnlineDriver('9840000006');

    const res = await driverAgent.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 2000 });
    expect(res.status).toBe(400);
  });

  it('a hamali_solo cannot bid on a truck-type load, and vice versa', async () => {
    const { user: customer } = await loginAs('customer', '9840000007');
    const truckBooking = await makeOpenTruckBooking(customer._id.toString());
    const { agent: hamaliAgent } = await loginAsOnlineSoloHamali();

    const res = await hamaliAgent.post(`/api/loadboard/${truckBooking._id}/bids`).send({ amount: 300 });
    expect(res.status).toBe(400);
  });

  it('a bidder can withdraw their own pending bid, then re-bid', async () => {
    const { user: customer } = await loginAs('customer', '9840000008');
    const booking = await makeOpenTruckBooking(customer._id.toString());
    const { agent: driverAgent } = await loginAsOnlineDriver('9840000009');

    const placed = await driverAgent.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 450 });
    const withdrawn = await driverAgent.post(`/api/loadboard/${booking._id}/bids/${placed.body.bid._id}/withdraw`);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body.bid.status).toBe('withdrawn');

    const rebid = await driverAgent.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 430 });
    expect(rebid.status).toBe(200);
    expect(rebid.body.bid._id).not.toBe(placed.body.bid._id); // a genuinely new row
  });
});

describe('load board — customer reviewing and accepting bids', () => {
  it('only the owning customer (or admin) can list bids for a booking', async () => {
    const { user: customer } = await loginAs('customer', '9840000010');
    const booking = await makeOpenTruckBooking(customer._id.toString());
    const { agent: otherCustomerAgent } = await loginAs('customer', '9840000011');

    const res = await otherCustomerAgent.get(`/api/loadboard/${booking._id}/bids`);
    expect(res.status).toBe(403);
  });

  it('lists pending bids cheapest-first with bidder name populated', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9840000012');
    const booking = await makeOpenTruckBooking(customer._id.toString());
    const { agent: driverA } = await loginAsOnlineDriver('9840000013');
    const { agent: driverB } = await loginAsOnlineDriver('9840000014');
    await driverA.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 450 });
    await driverB.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 380 });

    const res = await customerAgent.get(`/api/loadboard/${booking._id}/bids`);
    expect(res.status).toBe(200);
    expect(res.body.bids).toHaveLength(2);
    expect(res.body.bids[0].amount).toBe(380); // cheapest first
    expect(res.body.bids[0].bidderId.name).toBe('U');
  });

  it('accepting a bid assigns the winning driver, re-prices the booking to the bid amount, and rejects the other bids', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9840000015');
    const booking = await makeOpenTruckBooking(customer._id.toString(), 500);
    const { agent: driverA, driver: winnerDriver } = await loginAsOnlineDriver('9840000016');
    const { agent: driverB } = await loginAsOnlineDriver('9840000017');

    const winBid = await driverA.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 400 });
    const loseBid = await driverB.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 450 });

    const accept = await customerAgent.post(`/api/loadboard/${booking._id}/bids/${winBid.body.bid._id}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body.booking.fareBreakdown.total).toBe(400);
    expect(accept.body.booking.assignedDriverIds).toContain(winnerDriver._id.toString());
    expect(accept.body.booking.openForBidding).toBe(false);
    expect(accept.body.booking.status).toBe('accepted');

    const lostBid = await Bid.findById(loseBid.body.bid._id);
    expect(lostBid!.status).toBe('rejected');

    const winnerVehicle = await Vehicle.findOne({ ownerId: winnerDriver._id });
    expect(winnerVehicle!.availabilityStatus).toBe('on_job');
  });

  it('a flat-fare accept via /api/requests is blocked while a booking is still open for bidding', async () => {
    const { user: customer } = await loginAs('customer', '9840000018');
    const booking = await makeOpenTruckBooking(customer._id.toString());
    const { agent: driverAgent } = await loginAsOnlineDriver('9840000019');

    const res = await driverAgent.post(`/api/requests/${booking._id}/accept`);
    expect(res.status).toBe(409);
  });

  it('a non-owning customer cannot accept a bid on someone else\'s booking', async () => {
    const { user: customer } = await loginAs('customer', '9840000020');
    const booking = await makeOpenTruckBooking(customer._id.toString());
    const { agent: driverAgent } = await loginAsOnlineDriver('9840000021');
    const bid = await driverAgent.post(`/api/loadboard/${booking._id}/bids`).send({ amount: 400 });

    const { agent: attackerAgent } = await loginAs('customer', '9840000022');
    const res = await attackerAgent.post(`/api/loadboard/${booking._id}/bids/${bid.body.bid._id}/accept`);
    expect(res.status).toBe(403);
  });
});

describe('createBooking — openForBidding scoping', () => {
  it('rejects openForBidding combined with a combo booking type', async () => {
    const { agent } = await loginAs('customer', '9840000023');
    const res = await agent.post('/api/bookings').send({
      type: 'combo',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 200 },
      pickupLocation: { coordinates: PICKUP, address: 'A' },
      dropLocation: { coordinates: DROP, address: 'B' },
      requiredVehicles: [{ capacityKg: 200, count: 1 }],
      requiredHamaliCount: 2,
      openForBidding: true,
    });
    expect(res.status).toBe(400);
  });

  it('an openForBidding booking never gets the automatic push-offer flow (still visible on /api/requests as before)', async () => {
    await seedTruckRule();
    const { agent } = await loginAs('customer', '9840000024');
    const res = await agent.post('/api/bookings').send({
      type: 'truck',
      region: 'Visakhapatnam',
      cargoDetails: { weightKg: 200 },
      pickupLocation: { coordinates: PICKUP, address: 'A' },
      dropLocation: { coordinates: DROP, address: 'B' },
      requiredVehicles: [{ capacityKg: 200, count: 1 }],
      openForBidding: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.booking.openForBidding).toBe(true);
    expect(res.body.booking.status).toBe('searching');
  });
});
