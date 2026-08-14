import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import * as geocodeService from '../src/services/geocode.service';

async function loginAsCustomer(phone = '9860000001') {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  await User.create({ name: 'Cust', phone, passwordHash, role: 'customer' });
  const agent = request.agent(app);
  await agent.post('/api/auth/login').send({ phone, password: 'Passw0rd!' });
  return agent;
}

describe('GET /api/geocode', () => {
  it('proxies to geocodeAddress and returns its results for an authenticated user', async () => {
    const spy = jest
      .spyOn(geocodeService, 'geocodeAddress')
      .mockResolvedValue([{ lat: 17.385, lon: 78.4867, displayName: 'Hyderabad, Telangana, India' }]);

    const agent = await loginAsCustomer();
    const res = await agent.get('/api/geocode').query({ q: 'Hyderabad' });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ lat: 17.385, lon: 78.4867, displayName: 'Hyderabad, Telangana, India' }]);
    expect(spy).toHaveBeenCalledWith('Hyderabad');
    spy.mockRestore();
  });

  it('requires a non-empty q param', async () => {
    const agent = await loginAsCustomer('9860000002');
    const res = await agent.get('/api/geocode').query({ q: '' });
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated request', async () => {
    // Not a public endpoint — the only real consumer (address entry during
    // booking) is always behind login already, so requiring auth here
    // closes off an unlimited free Nominatim relay for anonymous traffic
    // with no functional loss for the actual use case.
    const res = await request(app).get('/api/geocode').query({ q: 'anywhere' });
    expect(res.status).toBe(401);
  });

  it('works for any authenticated role, not just customer', async () => {
    jest.spyOn(geocodeService, 'geocodeAddress').mockResolvedValue([]);
    const passwordHash = await bcrypt.hash('Passw0rd!', 12);
    await User.create({ name: 'Drv', phone: '9860000003', passwordHash, role: 'driver' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ phone: '9860000003', password: 'Passw0rd!' });

    const res = await agent.get('/api/geocode').query({ q: 'anywhere' });
    expect(res.status).toBe(200);
  });
});
