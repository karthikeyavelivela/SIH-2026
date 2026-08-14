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
