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
