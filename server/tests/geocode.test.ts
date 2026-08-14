import './setup';
import request from 'supertest';
import { app } from '../src/app';
import * as geocodeService from '../src/services/geocode.service';

describe('GET /api/geocode', () => {
  it('proxies to geocodeAddress and returns its results', async () => {
    const spy = jest
      .spyOn(geocodeService, 'geocodeAddress')
      .mockResolvedValue([{ lat: 17.385, lon: 78.4867, displayName: 'Hyderabad, Telangana, India' }]);

    const res = await request(app).get('/api/geocode').query({ q: 'Hyderabad' });

    expect(res.status).toBe(200);
    expect(res.body.results).toEqual([{ lat: 17.385, lon: 78.4867, displayName: 'Hyderabad, Telangana, India' }]);
    expect(spy).toHaveBeenCalledWith('Hyderabad');
    spy.mockRestore();
  });

  it('requires a non-empty q param', async () => {
    const res = await request(app).get('/api/geocode').query({ q: '' });
    expect(res.status).toBe(400);
  });

  it('does not require authentication (public endpoint)', async () => {
    jest.spyOn(geocodeService, 'geocodeAddress').mockResolvedValue([]);
    const res = await request(app).get('/api/geocode').query({ q: 'anywhere' });
    expect(res.status).toBe(200);
  });
});
