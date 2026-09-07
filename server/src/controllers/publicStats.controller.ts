import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { User } from '../models/User';
import { Mutha } from '../models/Mutha';
import { Booking } from '../models/Booking';
import { Federation } from '../models/Federation';
import { ServiceCategory } from '../models/ServiceCategory';

/**
 * The public landing page's counters.
 *
 * The marketing design leads with a live settled-value figure and closes on
 * a federation stat row. Until now nothing could serve those: every stats
 * surface in this product is admin-gated, so the page either had to omit the
 * numbers or invent them. This is the honest third option — a small,
 * unauthenticated, aggregate-only endpoint.
 *
 * Deliberately aggregate-only: counts and one sum, no per-user, per-society
 * or per-booking data, so making it public leaks nothing. `settledValue`
 * counts completed bookings only — money that actually moved — never
 * requested or in-flight ones, so the number can never run ahead of reality.
 */

interface CachedStats {
  at: number;
  payload: Record<string, number>;
}

/**
 * Cached for a minute. This is on an unauthenticated route, so it must not
 * turn into a way to make an anonymous caller run six aggregations per
 * request; the numbers do not need to be fresher than this.
 */
const TTL_MS = 60_000;
let cache: CachedStats | null = null;

export const getPublicStats = asyncHandler(async (_req: Request, res: Response) => {
  if (cache && Date.now() - cache.at < TTL_MS) {
    res.status(200).json({ stats: cache.payload, cachedFor: Math.round((TTL_MS - (Date.now() - cache.at)) / 1000) });
    return;
  }

  const [societies, workers, completedAgg, federations, categories] = await Promise.all([
    Mutha.countDocuments({}),
    User.countDocuments({ role: { $in: ['driver', 'hamali_solo', 'mutha_member', 'mutha_leader'] } }),
    Booking.aggregate<{ _id: null; count: number; total: number }>([
      { $match: { status: 'completed' } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$fareBreakdown.total' } } },
    ]),
    Federation.countDocuments({}),
    ServiceCategory.countDocuments({ active: true }),
  ]);

  const completed = completedAgg[0] ?? { count: 0, total: 0 };

  const payload = {
    societies,
    workers,
    completedJobs: completed.count,
    settledValue: Math.round(completed.total),
    federations,
    categories,
  };

  cache = { at: Date.now(), payload };
  res.status(200).json({ stats: payload, cachedFor: TTL_MS / 1000 });
});
