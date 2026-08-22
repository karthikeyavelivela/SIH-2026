import rateLimit from 'express-rate-limit';

// Uses the default in-memory store — fine for Phase 1's single-instance
// dev/deploy. Before horizontal scaling, swap to a shared store (e.g.
// rate-limit-redis) and set `app.set('trust proxy', ...)` so req.ip is
// correct behind a load balancer.
//
// Keyed by IP + route path (not just IP) so the limit applies per auth
// endpoint — e.g. 5 signup/customer attempts and 5 signup/hamali attempts
// from the same IP are tracked independently, rather than one shared
// endpoint's traffic exhausting another endpoint's budget.
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, try again in a minute.' },
  keyGenerator: (req) => `${req.ip}:${req.path}`,
});

// Geocode proxy — auth-gated (verifyJwt runs before this middleware in
// geocode.routes.ts), but keying by IP alone would undermine the reason
// auth was required: a JWT cookie isn't IP-bound, so one account replayed
// across rotating source IPs would still get a fresh 20/min bucket per IP
// — unbounded aggregate throughput from a single signup. Keyed by the
// authenticated user's id instead, so the cap is actually per-account.
export const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many geocode requests, try again in a minute.' },
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

// Booking creation — required by the spec's "rate limit ... booking
// creation" security requirement, missed when the booking routes first
// landed. Keyed by user id for the same reason as geocodeLimiter: a JWT
// isn't IP-bound, so an IP-only key would let one account exhaust the
// matching pipeline's candidate pool by spamming real, persisted Bookings
// from rotating IPs. 10/min comfortably covers a customer retrying a
// misfired address without capping legitimate use.
export const bookingCreateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many booking attempts, try again in a minute.' },
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

// Quote (fare preview) — no side effects, but it's designed to be called
// repeatedly as a customer fills in the booking form (each address pick,
// each weight/count change), so it needs real headroom over the create
// limiter while still being bounded per-account.
export const bookingQuoteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many fare-estimate requests, try again in a minute.' },
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

// Job requests feed/accept/reject/start/complete — polled by driver/hamali/
// mutha-leader clients while online, so it needs real headroom (a poll
// every few seconds is normal use), but still bounded per-account against
// a runaway client or an accept/reject spam attempt against the same
// booking id.
export const requestsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again in a minute.' },
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
});

// Phase 4 AI agents — "rate limit and cache agent calls; do not invoke on
// every page load" is an explicit guardrail. Real (non-mock) calls cost
// real money per request, so this cap is tighter than the other
// per-account limiters above; agents.controller.ts's 5-minute result
// cache (server/src/agents/cache.ts) is what actually keeps normal usage
// (a user re-opening the same page) from ever hitting this limit at all —
// this is the backstop against a client bypassing the cache (different
// cache keys) or retrying aggressively.
export const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI assistant requests, try again in a minute.' },
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
});
