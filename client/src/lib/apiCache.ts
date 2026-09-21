'use client';

/**
 * A small read-through cache in front of the API.
 *
 * WHY THIS EXISTS, MEASURED
 *
 * Every request to the API costs 0.4–1.3 seconds from a phone in India —
 * the service is on a free tier in another region, and that is the floor,
 * not a bug to fix in the client. Measured against production:
 *
 *     /api/auth/me                 0.90s
 *     /api/service-categories      0.43s
 *     /api/bookings                0.45s
 *     /api/addresses               0.41s
 *     /api/notifications/unread    0.93s
 *     /api/fare-rules/published    1.30s
 *
 * The customer home fires six of those on mount, and every route change
 * threw all of them away and started again — which is exactly what
 * "everything is slow, clicking, routing, page swaps" feels like.
 *
 * Most of those answers do not change while someone is using the app. The
 * service catalogue and the rate card change when an admin publishes;
 * saved addresses change when the person saves one. Re-fetching them on
 * every navigation buys nothing and costs a second each time.
 *
 * TWO THINGS, BOTH NARROW
 *
 *   1. A TTL cache, so a second visit to a screen within the window is
 *      instant instead of a spinner.
 *   2. In-flight de-duplication, so two components mounting at once that
 *      both want the catalogue make ONE request rather than two.
 *
 * WHAT IS DELIBERATELY NOT CACHED
 *
 * Anything that is the answer to "what is happening right now": a booking
 * list, a job offer, an unread count, a live position. A stale booking
 * status is a lie with a spinner's worth of speed behind it, and this app
 * has spent a lot of effort not telling those. Callers opt IN by passing a
 * key; everything else keeps going straight to the network.
 */

interface Entry {
  at: number;
  value: unknown;
}

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

/** Long enough to cover a session's worth of navigation, short enough that an admin's change lands without a reload. */
export const CATALOGUE_TTL_MS = 5 * 60 * 1000;
/** The person's own slowly-changing lists. Shorter, because they change them from inside the app. */
export const PERSONAL_TTL_MS = 60 * 1000;

export async function cachedGet<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  // Two components mounting in the same tick must not both hit the network.
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = fetcher()
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Drop a cached answer, by exact key or by prefix.
 *
 * Called after a write that invalidates it — saving an address, publishing
 * a rate. Without this the cache would be the thing that makes the app feel
 * broken instead of slow, which is a worse trade.
 */
export function invalidate(keyOrPrefix: string): void {
  for (const key of cache.keys()) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) cache.delete(key);
  }
}

/** Everything. Called on sign-out, because the next person on this device must not read the last one's data. */
export function clearApiCache(): void {
  cache.clear();
  inFlight.clear();
}
