import { haversineKm } from '../src/services/distance.service';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm({ lat: 17.385, lng: 78.4867 }, { lat: 17.385, lng: 78.4867 })).toBe(0);
  });

  it('computes a known distance (Hyderabad to Vijayawada, ~275km straight-line)', () => {
    const hyderabad = { lat: 17.385, lng: 78.4867 };
    const vijayawada = { lat: 16.5062, lng: 80.648 };
    const km = haversineKm(hyderabad, vijayawada);
    expect(km).toBeGreaterThan(240);
    expect(km).toBeLessThan(280);
  });

  it('is symmetric', () => {
    const a = { lat: 17.0, lng: 78.0 };
    const b = { lat: 16.0, lng: 80.0 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 6);
  });
});
