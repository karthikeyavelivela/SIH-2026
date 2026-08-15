import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Mutha } from '../src/models/Mutha';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function loginAsOnlineDriver(phone = '9830000001', capacityKg = 1000) {
  const { agent, user: driver } = await loginAs('driver', phone);
  await Vehicle.create({
    ownerId: driver._id,
    type: 'mini_truck',
    capacityKg,
    registrationNumber: `AP02Z${phone.slice(-4)}`,
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: PICKUP },
  });
  return { agent, driver };
}

async function loginAsOnlineSoloHamali(phone = '9830000101') {
  const { agent, user: hamali } = await loginAs('hamali_solo', phone);
  await HamaliProfile.create({
    userId: hamali._id,
    type: 'solo',
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: PICKUP },
  });
  return { agent, hamali };
}

async function makeCustomer(phone = '9830009999') {
  return User.create({ name: 'Cust', phone, passwordHash: 'x', role: 'customer' });
}

async function makeTruckBooking(overrides: Partial<Record<string, unknown>> = {}) {
  const customer = await makeCustomer(overrides.customerPhone as string | undefined);
  return Booking.create({
    customerId: customer._id,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    status: 'searching',
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
    ...overrides,
  });
}

async function makeHamaliBooking(requiredHamaliCount: number, overrides: Partial<Record<string, unknown>> = {}) {
  const customer = await makeCustomer(overrides.customerPhone as string | undefined);
  return Booking.create({
    customerId: customer._id,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredHamaliCount,
    status: 'searching',
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
    ...overrides,
  });
}

describe('driver requests', () => {
  it('lists an open matching truck booking, accepts it, and flips the vehicle + booking state', async () => {
    const { agent, driver } = await loginAsOnlineDriver();
    const booking = await makeTruckBooking();

    const list = await agent.get('/api/requests');
    expect(list.status).toBe(200);
    expect(list.body.requests.map((b: { _id: string }) => b._id)).toContain(booking._id.toString());

    const accept = await agent.post(`/api/requests/${booking._id}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body.booking.status).toBe('accepted');
    expect(accept.body.booking.assignedDriverIds).toEqual([driver._id.toString()]);

    const vehicle = await Vehicle.findOne({ ownerId: driver._id });
    expect(vehicle?.availabilityStatus).toBe('on_job');
  });

  it('rejects a second driver trying to accept an already-accepted booking (409)', async () => {
    const { agent: agent1 } = await loginAsOnlineDriver('9830000002');
    const { agent: agent2 } = await loginAsOnlineDriver('9830000003');
    const booking = await makeTruckBooking();

    const first = await agent1.post(`/api/requests/${booking._id}/accept`);
    expect(first.status).toBe(200);

    const second = await agent2.post(`/api/requests/${booking._id}/accept`);
    expect(second.status).toBe(409);
  });

  it('excludes a booking the driver already rejected from a subsequent list', async () => {
    const { agent } = await loginAsOnlineDriver('9830000004');
    const booking = await makeTruckBooking();

    const reject = await agent.post(`/api/requests/${booking._id}/reject`);
    expect(reject.status).toBe(200);

    const list = await agent.get('/api/requests');
    expect(list.body.requests.map((b: { _id: string }) => b._id)).not.toContain(booking._id.toString());
  });

  it('returns an empty list while the driver is offline instead of erroring', async () => {
    const { agent, driver } = await loginAsOnlineDriver('9830000005');
    await Vehicle.updateOne({ ownerId: driver._id }, { availabilityStatus: 'offline' });
    await makeTruckBooking();

    const list = await agent.get('/api/requests');
    expect(list.status).toBe(200);
    expect(list.body.requests).toEqual([]);
  });

  it('does not offer a booking whose required capacity exceeds the driver\'s vehicle', async () => {
    const { agent } = await loginAsOnlineDriver('9830000006', 300);
    await makeTruckBooking();

    const list = await agent.get('/api/requests');
    expect(list.body.requests).toEqual([]);
  });
});

describe('hamali_solo requests', () => {
  it('partially fills a multi-worker booking without advancing status until fully staffed', async () => {
    const { agent: agent1 } = await loginAsOnlineSoloHamali('9830000102');
    const { agent: agent2 } = await loginAsOnlineSoloHamali('9830000103');
    const booking = await makeHamaliBooking(2);

    const first = await agent1.post(`/api/requests/${booking._id}/accept`);
    expect(first.status).toBe(200);
    expect(first.body.booking.status).toBe('searching');
    expect(first.body.booking.assignedHamaliIds).toHaveLength(1);

    const second = await agent2.post(`/api/requests/${booking._id}/accept`);
    expect(second.status).toBe(200);
    expect(second.body.booking.status).toBe('accepted');
    expect(second.body.booking.assignedHamaliIds).toHaveLength(2);
  });
});

describe('mutha_leader requests', () => {
  async function makeMutha(leaderPhone: string, memberCount: number, inviteCode: string) {
    const { agent, user: leader } = await loginAs('mutha_leader', leaderPhone);
    const memberUsers = [];
    for (let i = 0; i < memberCount; i++) {
      memberUsers.push(await User.create({ name: `M${i}`, phone: `98400001${i}${leaderPhone.slice(-2)}`, passwordHash: 'x', role: 'mutha_member' }));
    }
    const mutha = await Mutha.create({
      name: 'Group',
      leaderId: leader._id,
      memberIds: memberUsers.map((m) => m._id),
      inviteCode,
    });
    for (const m of memberUsers) {
      await HamaliProfile.create({
        userId: m._id,
        type: 'mutha_member',
        muthaId: mutha._id,
        availabilityStatus: 'online',
        currentLocation: { type: 'Point', coordinates: PICKUP },
      });
    }
    return { agent, leader, mutha, memberUsers };
  }

  it('lists a qualifying booking, assigns specific online members, and advances status once fully staffed', async () => {
    const { agent, mutha, memberUsers } = await makeMutha('9840000001', 2, 'INV001');
    const booking = await makeHamaliBooking(2);

    const list = await agent.get('/api/requests');
    expect(list.body.requests.map((b: { _id: string }) => b._id)).toContain(booking._id.toString());

    const accept = await agent
      .post(`/api/requests/${booking._id}/accept`)
      .send({ memberIds: memberUsers.map((m) => m._id.toString()) });
    expect(accept.status).toBe(200);
    expect(accept.body.booking.status).toBe('accepted');
    expect(accept.body.booking.assignedMuthaId).toBe(mutha._id.toString());
    expect(accept.body.booking.assignedHamaliIds).toHaveLength(2);

    const profiles = await HamaliProfile.find({ userId: { $in: memberUsers.map((m) => m._id) } });
    expect(profiles.every((p) => p.availabilityStatus === 'on_job')).toBe(true);
  });

  it('rejects assigning a member id that does not belong to the leader\'s Mutha (403)', async () => {
    const { agent } = await makeMutha('9840000002', 1, 'INV002');
    const outsider = await User.create({ name: 'X', phone: '9840009999', passwordHash: 'x', role: 'mutha_member' });
    const booking = await makeHamaliBooking(1);

    const accept = await agent
      .post(`/api/requests/${booking._id}/accept`)
      .send({ memberIds: [outsider._id.toString()] });
    expect(accept.status).toBe(403);
  });

  it('rejects assigning a member who is not currently online (400)', async () => {
    const { agent, memberUsers } = await makeMutha('9840000003', 1, 'INV003');
    await HamaliProfile.updateOne({ userId: memberUsers[0]._id }, { availabilityStatus: 'offline' });
    const booking = await makeHamaliBooking(1);

    const accept = await agent
      .post(`/api/requests/${booking._id}/accept`)
      .send({ memberIds: [memberUsers[0]._id.toString()] });
    expect(accept.status).toBe(400);
  });
});

describe('job lifecycle: start / complete', () => {
  it('lets the assigned driver start then complete a job, freeing the vehicle back to online', async () => {
    const { agent, driver } = await loginAsOnlineDriver('9830000201');
    const booking = await makeTruckBooking();
    await agent.post(`/api/requests/${booking._id}/accept`);

    const start = await agent.post(`/api/requests/${booking._id}/start`);
    expect(start.status).toBe(200);
    expect(start.body.booking.status).toBe('in_progress');

    const complete = await agent.post(`/api/requests/${booking._id}/complete`);
    expect(complete.status).toBe(200);
    expect(complete.body.booking.status).toBe('completed');

    const vehicle = await Vehicle.findOne({ ownerId: driver._id });
    expect(vehicle?.availabilityStatus).toBe('online');
  });

  it('blocks a driver who is not assigned to the booking from starting it (403)', async () => {
    const { agent: assignedAgent } = await loginAsOnlineDriver('9830000202');
    const { agent: strangerAgent } = await loginAsOnlineDriver('9830000203');
    const booking = await makeTruckBooking();
    await assignedAgent.post(`/api/requests/${booking._id}/accept`);

    const start = await strangerAgent.post(`/api/requests/${booking._id}/start`);
    expect(start.status).toBe(403);
  });

  it('rejects starting a job the driver IS assigned to but that is not fully staffed yet (400, combo)', async () => {
    // A combo booking needs both a driver and a hamali before status
    // advances past 'searching' — accepting the vehicle side alone leaves
    // the driver genuinely assigned (so the 403 "not assigned" guard
    // correctly does NOT fire) while the booking itself still isn't
    // startable, which is the real path that should hit the 400 guard.
    const { agent } = await loginAsOnlineDriver('9830000204');
    const customer = await makeCustomer('9830009998');
    const booking = await Booking.create({
      customerId: customer._id,
      type: 'combo',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      requiredHamaliCount: 1,
      status: 'searching',
      statusHistory: [{ status: 'searching', timestamp: new Date() }],
    });
    const accept = await agent.post(`/api/requests/${booking._id}/accept`);
    expect(accept.body.booking.status).toBe('searching'); // hamali side still unfilled

    const start = await agent.post(`/api/requests/${booking._id}/start`);
    expect(start.status).toBe(400);
  });

  it('blocks starting a job the driver was never assigned to at all (403)', async () => {
    const { agent } = await loginAsOnlineDriver('9830000205');
    const booking = await makeTruckBooking();

    const start = await agent.post(`/api/requests/${booking._id}/start`);
    expect(start.status).toBe(403);
  });
});

describe('GET /api/requests/mine', () => {
  it('returns bookings assigned to the caller, scoped by role', async () => {
    const { agent, driver } = await loginAsOnlineDriver('9830000301');
    const booking = await makeTruckBooking();
    await agent.post(`/api/requests/${booking._id}/accept`);

    const mine = await agent.get('/api/requests/mine');
    expect(mine.status).toBe(200);
    expect(mine.body.bookings.map((b: { _id: string }) => b._id)).toEqual([booking._id.toString()]);
    void driver;
  });
});
