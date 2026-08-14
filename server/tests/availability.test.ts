import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';

async function loginAsDriver(phone = '9820000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const driver = await User.create({ name: 'Drv', phone, passwordHash, role: 'driver' });
  await Vehicle.create({
    ownerId: driver._id,
    type: 'mini_truck',
    capacityKg: 1000,
    registrationNumber: `AP01Z${phone.slice(-4)}`,
  });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, password: 'Passw0rd!' });
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
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    const hamali = await User.create({ name: 'H', phone: '9820000003', passwordHash, role: 'hamali_solo' });
    await HamaliProfile.create({ userId: hamali._id, type: 'solo' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9820000003', password: 'Passw0rd!' });

    const res = await agent
      .patch('/api/availability')
      .send({ status: 'online', location: { lat: 16.5, lng: 80.6 } });
    expect(res.status).toBe(200);

    const profile = await HamaliProfile.findOne({ userId: hamali._id });
    expect(profile?.availabilityStatus).toBe('online');
  });
});
