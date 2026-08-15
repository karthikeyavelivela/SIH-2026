import { Booking } from '../models/Booking';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';

// Spec: "Surge multiplier computed server-side per region as a simple
// ratio of currently-searching bookings to currently-online drivers/
// hamali in that region, clamped to a sane range (e.g. 1.0x-2.5x) —
// recompute periodically, not on every request, to avoid thrashing."
const MIN_SURGE = 1.0;
const MAX_SURGE = 2.5;
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  value: number;
  expiresAt: number;
}

// In-memory, single-instance — same documented tradeoff as this
// codebase's other Phase 2/3-era in-memory state (rate limiters, the
// offer engine's queues). A shared cache (Redis) is the real fix before
// horizontal scaling; a stale-by-up-to-60s surge value per instance in
// the meantime is an acceptable, bounded inconsistency for a pricing
// signal that's explicitly meant to be a "simple ratio", not exact.
const cache = new Map<string, CacheEntry>();

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Returns the live surge multiplier for a region, recomputing at most once
 * per CACHE_TTL_MS. "Online drivers/hamali in that region" is read from
 * each worker's own User.region (set at signup) — Vehicle/HamaliProfile
 * track live GPS coordinates for matching, not a region label, so region
 * scoping for this ratio goes through the owning User.
 */
export async function getSurgeMultiplier(region: string): Promise<number> {
  const cached = cache.get(region);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const searchingCount = await Booking.countDocuments({ status: 'searching', region });

  const regionWorkers = await User.find({
    region,
    role: { $in: ['driver', 'hamali_solo', 'mutha_member'] },
  })
    .select('_id role')
    .lean();
  const driverIds = regionWorkers.filter((u) => u.role === 'driver').map((u) => u._id);
  const hamaliIds = regionWorkers.filter((u) => u.role !== 'driver').map((u) => u._id);

  const [onlineDrivers, onlineHamalis] = await Promise.all([
    Vehicle.countDocuments({ ownerId: { $in: driverIds }, availabilityStatus: 'online' }),
    HamaliProfile.countDocuments({ userId: { $in: hamaliIds }, availabilityStatus: 'online' }),
  ]);
  const onlineCount = onlineDrivers + onlineHamalis;

  // max(onlineCount, 1) avoids a divide-by-zero spike to Infinity when a
  // region has zero online workers — MAX_SURGE's clamp would catch it
  // anyway, but this keeps the raw ratio meaningful pre-clamp too.
  const raw = searchingCount / Math.max(onlineCount, 1);
  const value = round2(Math.min(MAX_SURGE, Math.max(MIN_SURGE, raw)));

  cache.set(region, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Test-only — clears the cache between tests so each one observes a fresh computation. */
export function _clearSurgeCacheForTests(): void {
  cache.clear();
}
