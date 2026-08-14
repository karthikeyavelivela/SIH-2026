import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';

describe('geo indexes declared on models', () => {
  it('Vehicle.currentLocation has a 2dsphere index', () => {
    const indexes = Vehicle.schema.indexes();
    expect(indexes.some(([def]) => def.currentLocation === '2dsphere')).toBe(true);
  });

  it('HamaliProfile.currentLocation has a 2dsphere index', () => {
    const indexes = HamaliProfile.schema.indexes();
    expect(indexes.some(([def]) => def.currentLocation === '2dsphere')).toBe(true);
  });

  it('Booking pickup and drop locations have 2dsphere indexes', () => {
    const indexes = Booking.schema.indexes();
    expect(indexes.some(([def]) => def.pickupLocation === '2dsphere')).toBe(true);
    expect(indexes.some(([def]) => def.dropLocation === '2dsphere')).toBe(true);
  });
});
