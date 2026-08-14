import { Router } from 'express';
import { query } from 'express-validator';
import { geocodeLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import * as geocodeController from '../controllers/geocode.controller';

export const geocodeRouter = Router();

geocodeRouter.get(
  '/',
  geocodeLimiter,
  [query('q').isString().trim().isLength({ min: 1, max: 200 })],
  validate,
  geocodeController.geocode
);
