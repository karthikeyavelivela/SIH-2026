/**
 * Mirrors the server's DEFAULT_PLATFORM_COMMISSION_PCT
 * (server/src/services/platformCommission.service.ts) for display only.
 *
 * Every screen prefers the live `platformRatePct` the earnings endpoint
 * returns; this is the fallback for surfaces that render before that call
 * resolves, or that have no earnings call at all. The server is always the
 * authority on what is actually deducted.
 */
export const DEFAULT_PLATFORM_COMMISSION_PCT = 10;
