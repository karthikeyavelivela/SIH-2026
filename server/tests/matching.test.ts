import './setup';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { User } from '../src/models/User';
import {
  findCandidateVehicles,
  findCandidateHamaliSolos,
} from '../src/services/matching.service';

async function makeDriver(phone: string) {
  return User.create({ name: 'D', phone, passwordHash: 'x', role: 'driver' });
}

describe('findCandidateVehicles', () => {
  it('returns only online vehicles with sufficient capacity, nearest first', async () => {
    const owner1 = await makeDriver('9700000001');
    const owner2 = await makeDriver('9700000002');
    const owner3 = await makeDriver('9700000003');

    const pickup: [number, number] = [78.4867, 17.385];

    await Vehicle.create({
      ownerId: owner1._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0001',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [78.49, 17.39] },
    });
    await Vehicle.create({
      ownerId: owner2._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0002',
      availabilityStatus: 'offline',
      currentLocation: { type: 'Point', coordinates: [78.491, 17.391] },
    });
    await Vehicle.create({
      ownerId: owner3._id,
      type: 'mini_truck',
      capacityKg: 500,
      availabilityStatus: 'online',
      registrationNumber: 'AP01A0003',
      currentLocation: { type: 'Point', coordinates: [78.492, 17.392] },
    });

    const candidates = await findCandidateVehicles({
      pickup,
      requiredCapacityKg: 800,
      maxDistanceKm: 50,
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].ownerId.toString()).toBe(owner1._id.toString());
  });

  it('excludes vehicles beyond maxDistanceKm', async () => {
    const owner = await makeDriver('9700000004');
    await Vehicle.create({
      ownerId: owner._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0004',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [80.648, 16.5062] },
    });

    const candidates = await findCandidateVehicles({
      pickup: [78.4867, 17.385],
      requiredCapacityKg: 500,
      maxDistanceKm: 50,
    });

    expect(candidates.length).toBe(0);
  });
});

describe('findCandidateHamaliSolos', () => {
  it('returns only online solo hamali profiles near the pickup point', async () => {
    const user1 = await User.create({ name: 'H', phone: '9700000005', passwordHash: 'x', role: 'hamali_solo' });
    await HamaliProfile.create({
      userId: user1._id,
      type: 'solo',
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: [78.49, 17.39] },
    });

    const candidates = await findCandidateHamaliSolos({
      pickup: [78.4867, 17.385],
      maxDistanceKm: 50,
    });

    expect(candidates.length).toBe(1);
    expect(candidates[0].userId.toString()).toBe(user1._id.toString());
  });
});
