import { ApiError } from './ApiError';

interface MongoDuplicateKeyError {
  code: number;
  keyPattern?: Record<string, unknown>;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/**
 * Converts a MongoDB E11000 duplicate-key error into a clean 409 ApiError
 * instead of letting it fall through to the generic 500 handler. Needed
 * because:
 *  - A `findOne` pre-check before `create()` only narrows the race window,
 *    it doesn't close it — two concurrent requests for the same phone can
 *    both pass the pre-check and only one `create()` wins at the DB level.
 *  - Some unique fields (Vehicle.registrationNumber, Mutha.inviteCode) have
 *    no pre-check at all; this is the only thing standing between a
 *    collision and a raw, unhelpful 500.
 *
 * Usage: wrap a write in try/catch and call `rethrowAsConflict(err, 'field
 * label')` in the catch block. Re-throws unmodified if it's not a
 * duplicate-key error, so normal error handling still applies.
 */
export function rethrowAsConflict(err: unknown, label: string): never {
  if (isDuplicateKeyError(err)) {
    throw new ApiError(409, `${label} already in use`);
  }
  throw err;
}
