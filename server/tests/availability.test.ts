import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Mutha } from '../src/models/Mutha';
import { signAccessToken } from '../src/services/token.service';

// Mints the accessToken cookie directly rather than calling the real
// POST /api/auth/login — this file's growing test count would otherwise
// burn against the shared per-file authLimiter bucket (5/min). Same fix
// already applied in admin.test.ts and booking.test.ts.
async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function loginAsDriver(phone = '9820000001') {
  const { agent, user: driver } = await loginAs('driver', phone);
  await Vehicle.create({
    ownerId: driver._id,
    type: 'mini_truck',
    capacityKg: 1000,
    registrationNumber: `AP01Z${phone.slice(-4)}`,
  });
  return { agent, driver };
}

describe('availability toggle', () => {
  it('lets a driver go online with a location, then offline', async () => {
    const { agent, driver } = await loginAsDriver();

    const online = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 17.385, lng: 78.4867 } });
    expect(online.status).toBe(200);

    const vehicle = await Vehicle.findOne({ ownerId: driver._id });
    expect(vehicle?.availabilityStatus).toBe('online');
    expect(vehicle?.currentLocation.coordinates).toEqual([78.4867, 17.385]);

    const offline = await agent.patch('/api/availability').send({ status: 'offline' });
    expect(offline.status).toBe(200);
    const vehicleAfter = await Vehicle.findOne({ ownerId: driver._id });
    expect(vehicleAfter?.availabilityStatus).toBe('offline');
  });

  it('rejects going online without a location', async () => {
    const { agent } = await loginAsDriver('9820000002');
    const res = await agent.patch('/api/availability').send({ status: 'online' });
    expect(res.status).toBe(400);
  });

  it('works for a hamali_solo user against their HamaliProfile', async () => {
    const { agent, user: hamali } = await loginAs('hamali_solo', '9820000003');
    await HamaliProfile.create({ userId: hamali._id, type: 'solo' });

    const res = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 16.5, lng: 80.6 } });
    expect(res.status).toBe(200);

    const profile = await HamaliProfile.findOne({ userId: hamali._id });
    expect(profile?.availabilityStatus).toBe('online');
  });

  it('works for a mutha_member against their own HamaliProfile', async () => {
    const { agent, user: member } = await loginAs('mutha_member', '9820000004');
    const leader = await User.create({ name: 'L', phone: '9820099999', passwordHash: 'x', role: 'mutha_leader' });
    const mutha = await Mutha.create({ name: 'Group', leaderId: leader._id, memberIds: [member._id], inviteCode: 'AVAILTEST' });
    await HamaliProfile.create({ userId: member._id, type: 'mutha_member', muthaId: mutha._id });

    const res = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 16.5, lng: 80.6 } });
    expect(res.status).toBe(200);

    const profile = await HamaliProfile.findOne({ userId: member._id });
    expect(profile?.availabilityStatus).toBe('online');
  });

  it('GET returns the current status so a client can render real state on load', async () => {
    const { agent, driver } = await loginAsDriver('9820000007');
    const before = await agent.get('/api/availability');
    expect(before.status).toBe(200);
    expect(before.body.availabilityStatus).toBe('offline');

    await agent.patch('/api/availability').send({ status: 'online', location: { lat: 17.4, lng: 78.5 } });
    const after = await agent.get('/api/availability');
    expect(after.body.availabilityStatus).toBe('online');
    void driver;
  });

  it('GET 403s for a mutha_leader (same as PATCH — nothing to toggle)', async () => {
    const { agent } = await loginAs('mutha_leader', '9820000008');
    const res = await agent.get('/api/availability');
    expect(res.status).toBe(403);
  });

  it('rejects a mutha_leader entirely — there is nothing for a leader to toggle here', async () => {
    const { agent } = await loginAs('mutha_leader', '9820000005');
    const res = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 16.5, lng: 80.6 } });
    expect(res.status).toBe(403);
  });

  it('rejects an out-of-range location even when going offline (not just when going online)', async () => {
    const { agent } = await loginAsDriver('9820000006');
    const res = await agent
      .patch('/api/availability')
      .send({ status: 'offline', location: { lat: 999, lng: 999 } });
    expect(res.status).toBe(400);

    const vehicle = await Vehicle.findOne();
    expect(vehicle?.currentLocation.coordinates).not.toEqual([999, 999]);
  });

  it('returns 404 for a hamali_solo user with no HamaliProfile at all', async () => {
    const { agent } = await loginAs('hamali_solo', '9820000007');
    // No HamaliProfile created for this user.
    const res = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 16.5, lng: 80.6 } });
    expect(res.status).toBe(404);
  });
});
