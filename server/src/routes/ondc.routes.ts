import { Router } from 'express';
import { param } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { storeFor } from '../infra/limiterStore';
import { clientIp } from '../middleware/clientIp';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { buildCatalogue } from '../services/ondcCatalog.service';

/**
 * GET /api/ondc/catalog/:societyId — a society's published services in
 * Beckn/ONDC catalogue shape. Public, because a catalogue is meant to be read;
 * limited per address, and it carries only what members chose to publish.
 * It is labelled as an export: FYRO makes no claim to be on the ONDC network.
 */
export const ondcRouter = Router();

const ondcLimiter = rateLimit({
  ...storeFor('ondcLimiter'),
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, try again in a minute.' },
  keyGenerator: (req) => clientIp(req),
});

ondcRouter.get(
  '/catalog/:societyId',
  ondcLimiter,
  [param('societyId').isMongoId()],
  validate,
  asyncHandler(async (req, res) => {
    res.status(200).json(await buildCatalogue(req.params.societyId));
  })
);
