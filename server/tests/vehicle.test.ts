import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Vehicle } from '../src/models/Vehicle';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

describe('GET /api/vehicles/me', () => {
  it("returns the caller's own vehicle", async () => {
    const { agent, user: driver } = await loginAs('driver', '9870000001');
    await Vehicle.create({ ownerId: driver._id, type: 'mini_truck', capacityKg: 1000, registrationNumber: 'AP01V0001' });

    const res = await agent.get('/api/vehicles/me');
    expect(res.status).toBe(200);
    expect(res.body.vehicle.registrationNumber).toBe('AP01V0001');
  });

  it('404s when the driver has no vehicle yet', async () => {
    const { agent } = await loginAs('driver', '9870000002');
    const res = await agent.get('/api/vehicles/me');
    expect(res.status).toBe(404);
  });

  it('is forbidden for a non-driver role', async () => {
    const { agent } = await loginAs('customer', '9870000003');
    const res = await agent.get('/api/vehicles/me');
    expect(res.status).toBe(403);
  });
});
