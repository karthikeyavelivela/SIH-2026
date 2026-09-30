import Redis from 'ioredis';
import { env } from '../config/env';

/**
 * Redis, only when REDIS_URL is set. With it unset everything that uses this
 * file keeps its in-memory behaviour, which is what local development and the
 * test suite run on, so nothing here is required to run FYRO on one instance.
 *
 * With it set, FYRO can run on more than one instance: rate limits, offer
 * state and Socket.io rooms are shared, and the scheduled jobs run once
 * instead of once per instance.
 */
export function redisEnabled(): boolean {
  return Boolean(env.REDIS_URL);
}

let shared: Redis | null = null;

function attachLogging(client: Redis, label: string) {
  client.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error(`redis (${label}) error: ${err.message}`);
  });
}

/** A new connection, for callers that need their own (pub/sub, BullMQ). */
export function newRedis(label: string, opts: { maxRetriesPerRequest?: number | null } = {}): Redis {
  const client = new Redis(env.REDIS_URL as string, { maxRetriesPerRequest: opts.maxRetriesPerRequest ?? 2 });
  attachLogging(client, label);
  return client;
}

/** The shared general-purpose connection, or null when Redis is not configured. */
export function getRedis(): Redis | null {
  if (!redisEnabled()) return null;
  if (!shared) shared = newRedis('shared');
  return shared;
}

export async function closeRedis(): Promise<void> {
  if (shared) {
    await shared.quit().catch(() => undefined);
    shared = null;
  }
}

/** For /api/health: is Redis configured, and does it answer a PING? */
export async function redisHealth(): Promise<{ configured: boolean; connected?: boolean }> {
  const r = getRedis();
  if (!r) return { configured: false };
  try {
    return { configured: true, connected: (await r.ping()) === 'PONG' };
  } catch {
    return { configured: true, connected: false };
  }
}
