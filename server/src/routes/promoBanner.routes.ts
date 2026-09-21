import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as controller from '../controllers/promoBanner.controller';
import { BANNER_MODES } from '../models/PromoBanner';

/** Read side — any signed-in person, because a banner is public-facing content. */
export const promoBannerRouter = Router();
promoBannerRouter.get(
  '/',
  verifyJwt,
  [query('mode').optional().isIn(BANNER_MODES)],
  validate,
  controller.listLiveBanners
);

/**
 * Write side — admin only, no manager carve-out. A promotional banner on the
 * home screen is a statement the platform makes to every customer; it sits
 * with fare rules and the commission rate, not with day-to-day operations.
 */
export const adminPromoBannerRouter = Router();
adminPromoBannerRouter.use(verifyJwt, requireRole('admin'));

const fields = [
  body('title').isString().trim().isLength({ min: 1, max: 80 }),
  body('body').optional({ checkFalsy: true }).isString().trim().isLength({ max: 200 }),
  body('ctaLabel').optional({ checkFalsy: true }).isString().trim().isLength({ max: 40 }),
  body('ctaHref').optional({ checkFalsy: true }).isString().trim().isLength({ max: 300 }),
  body('imageUrl').optional({ checkFalsy: true }).isURL(),
  body('mode').optional().isIn(BANNER_MODES),
  body('region').optional({ checkFalsy: true }).isString().trim(),
  body('startsAt').optional({ checkFalsy: true }).isISO8601(),
  body('endsAt').optional({ checkFalsy: true }).isISO8601(),
  body('order').optional().isInt({ min: -100, max: 100 }),
  body('active').optional().isBoolean(),
];

adminPromoBannerRouter.get('/', controller.listAllBanners);
adminPromoBannerRouter.post('/', fields, validate, controller.createBanner);
adminPromoBannerRouter.patch(
  '/:id',
  [param('id').isMongoId(), ...fields.map((f) => f.optional({ checkFalsy: true }))],
  validate,
  controller.updateBanner
);
