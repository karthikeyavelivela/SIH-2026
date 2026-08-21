import './setup';
import { Vehicle } from '../src/models/Vehicle';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Mutha } from '../src/models/Mutha';
import { User } from '../src/models/User';
import {
  findCandidateVehicles,
  findCandidateHamaliSolos,
  findCandidateMuthas,
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

  it('excludes an online, in-capacity vehicle that failed its compliance inspection', async () => {
    const compliantOwner = await makeDriver('9700000018');
    const nonCompliantOwner = await makeDriver('9700000019');
    const pickup: [number, number] = [78.4867, 17.385];

    await Vehicle.create({
      ownerId: compliantOwner._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0018',
      availabilityStatus: 'online',
      complianceStatus: 'compliant',
      currentLocation: { type: 'Point', coordinates: [78.49, 17.39] },
    });
    await Vehicle.create({
      ownerId: nonCompliantOwner._id,
      type: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01A0019',
      availabilityStatus: 'online',
      complianceStatus: 'non_compliant',
      currentLocation: { type: 'Point', coordinates: [78.491, 17.391] },
    });

    const candidates = await findCandidateVehicles({ pickup, requiredCapacityKg: 500, maxDistanceKm: 50 });

    expect(candidates.length).toBe(1);
    expect(candidates[0].ownerId.toString()).toBe(compliantOwner._id.toString());
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

describe('findCandidateMuthas', () => {
  const pickup: [number, number] = [78.4867, 17.385];

  async function makeLeader(phone: string) {
    return User.create({ name: 'L', phone, passwordHash: 'x', role: 'mutha_leader' });
  }

  async function makeOnlineMember(muthaId: string, phone: string, coords: [number, number]) {
    const user = await User.create({ name: 'M', phone, passwordHash: 'x', role: 'mutha_member' });
    await HamaliProfile.create({
      userId: user._id,
      type: 'mutha_member',
      muthaId,
      availabilityStatus: 'online',
      currentLocation: { type: 'Point', coordinates: coords },
    });
    return user;
  }

  it('excludes a Mutha with fewer qualifying online-nearby members than required', async () => {
    const leader = await makeLeader('9700000006');
    const mutha = await Mutha.create({
      name: 'Small Group',
      leaderId: leader._id,
      memberIds: [],
      inviteCode: 'SMALLGRP',
    });
    // Only 1 online member nearby, but the booking needs 2.
    await makeOnlineMember(mutha._id.toString(), '9700000007', [78.49, 17.39]);

    const candidates = await findCandidateMuthas({ pickup, maxDistanceKm: 50, requiredHamaliCount: 2 });
    expect(candidates.length).toBe(0);
  });

  it('includes a Mutha with enough qualifying online-nearby members, ranked by count descending', async () => {
    const leaderSmall = await makeLeader('9700000008');
    const smallMutha = await Mutha.create({
      name: 'Two Members',
      leaderId: leaderSmall._id,
      memberIds: [],
      inviteCode: 'TWOMEM01',
    });
    await makeOnlineMember(smallMutha._id.toString(), '9700000009', [78.49, 17.39]);
    await makeOnlineMember(smallMutha._id.toString(), '9700000010', [78.491, 17.391]);

    const leaderBig = await makeLeader('9700000011');
    const bigMutha = await Mutha.create({
      name: 'Three Members',
      leaderId: leaderBig._id,
      memberIds: [],
      inviteCode: 'THREEMEM1',
    });
    await makeOnlineMember(bigMutha._id.toString(), '9700000012', [78.492, 17.392]);
    await makeOnlineMember(bigMutha._id.toString(), '9700000013', [78.493, 17.393]);
    await makeOnlineMember(bigMutha._id.toString(), '9700000014', [78.494, 17.394]);

    const candidates = await findCandidateMuthas({ pickup, maxDistanceKm: 50, requiredHamaliCount: 2 });

    expect(candidates.length).toBe(2);
    // Ranked by qualifying-member count descending: the 3-member group first.
    expect(candidates[0]._id.toString()).toBe(bigMutha._id.toString());
    expect(candidates[1]._id.toString()).toBe(smallMutha._id.toString());
  });

  it('does not count an offline member toward the qualifying threshold', async () => {
    const leader = await makeLeader('9700000015');
    const mutha = await Mutha.create({
      name: 'One Online One Offline',
      leaderId: leader._id,
      memberIds: [],
      inviteCode: 'MIXEDGRP1',
    });
    await makeOnlineMember(mutha._id.toString(), '9700000016', [78.49, 17.39]);

    const offlineUser = await User.create({ name: 'Off', phone: '9700000017', passwordHash: 'x', role: 'mutha_member' });
    await HamaliProfile.create({
      userId: offlineUser._id,
      type: 'mutha_member',
      muthaId: mutha._id,
      availabilityStatus: 'offline',
      currentLocation: { type: 'Point', coordinates: [78.491, 17.391] },
    });

    const candidates = await findCandidateMuthas({ pickup, maxDistanceKm: 50, requiredHamaliCount: 2 });
    expect(candidates.length).toBe(0);
  });
});
