import type { ReadPreferenceMode } from 'mongodb';
import { redisEnabled } from './redis';

/**
 * Sends a read-only query to a secondary when FYRO is running in scaled mode
 * (REDIS_URL set), so dashboards and reports do not load the primary that the
 * bookings themselves are written to.
 *
 * Used ONLY on analytics, federation dashboard and report reads. Anything that
 * decides something, or reads back what it just wrote, stays on the primary,
 * because a secondary can be a moment behind.
 *
 *   onSecondary(Booking.aggregate([...]))
 *   onSecondary(Booking.find(filter)).sort(...).lean()
 */
export function onSecondary<Q extends { read(pref: ReadPreferenceMode): unknown }>(query: Q): Q {
  if (redisEnabled()) query.read('secondaryPreferred');
  return query;
}
