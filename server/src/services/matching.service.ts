import { Vehicle, IVehicle } from '../models/Vehicle';
import { HamaliProfile, IHamaliProfile } from '../models/HamaliProfile';
import { Mutha, IMutha } from '../models/Mutha';

// A worker's self-set "willing location" (see Vehicle/HamaliProfile doc
// comments) is searched with a much wider radius than live-GPS proximity
// matching — the point of declaring one is exactly "find me for jobs
// anchored near my base, even before I'm physically there." Drivers
// naturally cover more ground per job than hamali labor, hence the very
// different radii.
export const DRIVER_WILLING_RADIUS_KM = 200;
export const HAMALI_WILLING_RADIUS_KM = 20;

export function dedupeById<T extends { _id: { toString(): string } }>(lists: T[][]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const doc of list) {
      const id = doc._id.toString();
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(doc);
    }
  }
  return out;
}

interface CandidateVehicleQuery {
  pickup: [number, number]; // [lng, lat]
  requiredCapacityKg: number;
  maxDistanceKm: number;
}

export async function findCandidateVehicles(q: CandidateVehicleQuery): Promise<IVehicle[]> {
  const base = {
    availabilityStatus: 'online' as const,
    capacityKg: { $gte: q.requiredCapacityKg },
  };

  const [live, willing] = await Promise.all([
    Vehicle.find({
      ...base,
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: q.pickup },
          $maxDistance: q.maxDistanceKm * 1000,
        },
      },
    }),
    // Second, wider pass against the self-set anchor point — only
    // matches vehicles that actually have one (the sparse 2dsphere index
    // means $near here simply excludes docs missing the field, no need
    // to filter separately).
    Vehicle.find({
      ...base,
      willingLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: q.pickup },
          $maxDistance: DRIVER_WILLING_RADIUS_KM * 1000,
        },
      },
    }),
  ]);

  return dedupeById([live, willing]);
}

interface CandidateHamaliQuery {
  pickup: [number, number];
  maxDistanceKm: number;
}

export async function findCandidateHamaliSolos(q: CandidateHamaliQuery): Promise<IHamaliProfile[]> {
  const base = { type: 'solo' as const, availabilityStatus: 'online' as const };

  const [live, willing] = await Promise.all([
    HamaliProfile.find({
      ...base,
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: q.pickup },
          $maxDistance: q.maxDistanceKm * 1000,
        },
      },
    }),
    HamaliProfile.find({
      ...base,
      willingLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: q.pickup },
          $maxDistance: HAMALI_WILLING_RADIUS_KM * 1000,
        },
      },
    }),
  ]);

  return dedupeById([live, willing]);
}

interface CandidateMuthaQuery {
  pickup: [number, number];
  maxDistanceKm: number;
  requiredHamaliCount: number;
}

/**
 * A Mutha is a candidate if it has at least `requiredHamaliCount` members
 * whose own HamaliProfile is online and within range (live GPS OR their
 * own wider willing-location pass — same two-tier search as solo hamalis).
 * Ranks Muthas by how many qualifying online members they have near the
 * pickup point (most first), not by a single distance value, since a
 * group's "location" isn't one point.
 */
export async function findCandidateMuthas(q: CandidateMuthaQuery): Promise<IMutha[]> {
  const base = { type: 'mutha_member' as const, availabilityStatus: 'online' as const };

  const [liveMembers, willingMembers] = await Promise.all([
    HamaliProfile.find({
      ...base,
      currentLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: q.pickup },
          $maxDistance: q.maxDistanceKm * 1000,
        },
      },
    }).select('muthaId'),
    HamaliProfile.find({
      ...base,
      willingLocation: {
        $near: {
          $geometry: { type: 'Point', coordinates: q.pickup },
          $maxDistance: HAMALI_WILLING_RADIUS_KM * 1000,
        },
      },
    }).select('muthaId'),
  ]);
  const nearbyMemberProfiles = dedupeById([liveMembers, willingMembers]);

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
