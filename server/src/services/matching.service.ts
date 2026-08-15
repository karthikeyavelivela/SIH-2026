import { Vehicle, IVehicle } from '../models/Vehicle';
import { HamaliProfile, IHamaliProfile } from '../models/HamaliProfile';
import { Mutha, IMutha } from '../models/Mutha';

interface CandidateVehicleQuery {
  pickup: [number, number]; // [lng, lat]
  requiredCapacityKg: number;
  maxDistanceKm: number;
}

export async function findCandidateVehicles(q: CandidateVehicleQuery): Promise<IVehicle[]> {
  return Vehicle.find({
    availabilityStatus: 'online',
    capacityKg: { $gte: q.requiredCapacityKg },
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: q.pickup },
        $maxDistance: q.maxDistanceKm * 1000,
      },
    },
  });
}

interface CandidateHamaliQuery {
  pickup: [number, number];
  maxDistanceKm: number;
}

export async function findCandidateHamaliSolos(q: CandidateHamaliQuery): Promise<IHamaliProfile[]> {
  return HamaliProfile.find({
    type: 'solo',
    availabilityStatus: 'online',
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: q.pickup },
        $maxDistance: q.maxDistanceKm * 1000,
      },
    },
  });
}

interface CandidateMuthaQuery {
  pickup: [number, number];
  maxDistanceKm: number;
  requiredHamaliCount: number;
}

/**
 * A Mutha is a candidate if it has at least `requiredHamaliCount` members
 * whose own HamaliProfile is online and within range. Ranks Muthas by how
 * many qualifying online members they have near the pickup point (most
 * first), not by a single distance value, since a group's "location" isn't
 * one point.
 */
export async function findCandidateMuthas(q: CandidateMuthaQuery): Promise<IMutha[]> {
  const nearbyMemberProfiles = await HamaliProfile.find({
    type: 'mutha_member',
    availabilityStatus: 'online',
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates: q.pickup },
        $maxDistance: q.maxDistanceKm * 1000,
      },
    },
  }).select('muthaId');

  const muthaIdCounts = new Map<string, number>();
  for (const profile of nearbyMemberProfiles) {
    if (!profile.muthaId) continue;
    const key = profile.muthaId.toString();
    muthaIdCounts.set(key, (muthaIdCounts.get(key) ?? 0) + 1);
  }

  const qualifyingMuthaIds = [...muthaIdCounts.entries()]
    .filter(([, count]) => count >= q.requiredHamaliCount)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  if (qualifyingMuthaIds.length === 0) return [];

  const muthas = await Mutha.find({ _id: { $in: qualifyingMuthaIds } });
  const order = new Map(qualifyingMuthaIds.map((id, i) => [id, i]));
  return muthas.sort((a, b) => (order.get(a._id.toString()) ?? 0) - (order.get(b._id.toString()) ?? 0));
}
