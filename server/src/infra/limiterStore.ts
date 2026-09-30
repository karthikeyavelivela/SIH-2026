import { RedisStore } from 'rate-limit-redis';
import type { Options } from 'express-rate-limit';
import { getRedis } from './redis';

/**
 * The shared store for one rate limiter, or nothing (so express-rate-limit
 * uses its in-memory store) when Redis is not configured. Each limiter gets
 * its own key prefix, so one limiter's counters can never count against
 * another's.
 *
 * Spread into the limiter's options: `rateLimit({ ...storeFor('auth'), ... })`.
 */
export function storeFor(name: string): Partial<Options> {
  const client = getRedis();
  if (!client) return {};
  return {
    store: new RedisStore({
      prefix: `rl:${name}:`,
      // ioredis' generic command call, which is what rate-limit-redis expects.
      sendCommand: (command: string, ...args: string[]) => client.call(command, ...args) as Promise<never>,
    }),
  };
}
