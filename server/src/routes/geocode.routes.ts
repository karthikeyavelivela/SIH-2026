import { Router } from 'express';
import { query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { geocodeLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as geocodeController from '../controllers/geocode.controller';

export const geocodeRouter = Router();

// Gated behind auth, not public — the only consumer (address entry during
// booking) is always behind login already, so there's no genuine use case
// that needs anonymous access, and leaving it open would make this an
// unlimited free Nominatim relay for anyone on the internet (rotating
// source IPs trivially defeats the per-IP rate limit below). Any
// authenticated role can use it — it's not customer-specific, e.g. a
// driver's own profile/vehicle location entry could use it too.
geocodeRouter.get(
  '/',
  verifyJwt,
  geocodeLimiter,
  [query('q').isString().trim().isLength({ min: 1, max: 200 })],
  validate,
  geocodeController.geocode
);

geocodeRouter.get(
  '/reverse',
  verifyJwt,
  geocodeLimiter,
  [query('lat').isFloat({ min: -90, max: 90 }), query('lng').isFloat({ min: -180, max: 180 })],
  validate,
  geocodeController.reverseGeocodeHandler
);
