import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { bookingCreateLimiter, bookingQuoteLimiter } from '../middleware/rateLimit';
import { GOODS_TYPES } from '../models/Booking';
import * as bookingController from '../controllers/booking.controller';

export const bookingRouter = Router();

// Customer-only for every route below, enforced once at the router level so
// a future added route can't accidentally skip the gate.
bookingRouter.use(verifyJwt, requireRole('customer'));

const pointRule = (field: string) => [
  body(`${field}.coordinates`).isArray({ min: 2, max: 2 }),
  body(`${field}.coordinates.*`).isFloat(),
  body(`${field}.address`).isString().trim().isLength({ min: 1 }),
];

// Shared by create and quote — quote skips cargoDetails (irrelevant to
// pricing) but must price against the exact same type/region/points/
// vehicle/hamali shape create does, so a shown estimate can never validate
// differently than the booking it's estimating.
const pricingRules = [
  body('type').isIn(['truck', 'hamali', 'combo']),
  // Deliberately NOT isLength({min:1}) — customer/book/page.tsx sends
  // region:'' on purpose when the geocoder couldn't classify the pickup
  // address into a district/city/state (geocode.service.ts's extractRegion
  // returns undefined for plenty of real addresses), specifically so the
  // controller's own "No active fare rule for {region}/{category}" (422)
  // surfaces as an honest, actionable error instead of this validator
  // rejecting the request first with an opaque "Validation failed" that
  // names no field and matches the client's documented intent. Still
  // required as a *string* (never absent) so findActiveRule/Booking.create
  // always get '' rather than undefined, which Mongo would otherwise treat
  // as "match any region" in a query.
  body('region').isString().trim(),
  // SIH26089 Phase C — optional. When present, the server derives the
  // real dispatch `type` from the category's own dispatchType and ignores
  // whatever `type` the client sent alongside it (booking.controller.ts) —
  // `type` itself stays required above so the shape/validation contract
  // doesn't change for a category-less booking, this is purely additive.
  body('serviceCategorySlug').optional().isString().trim().isLength({ min: 1, max: 50 }),
  ...pointRule('pickupLocation'),
  ...pointRule('dropLocation'),
  // Phase 6.3 — multi-stop routing. Optional ordered waypoints between
  // pickup and drop; capped at 5 so a route can't be abused into an
  // arbitrarily expensive distance/geo computation.
  body('stops').optional().isArray({ max: 5 }),
  body('stops.*.coordinates').isArray({ min: 2, max: 2 }),
  body('stops.*.coordinates.*').isFloat(),
  body('stops.*.address').isString().trim().isLength({ min: 1 }),
  body('requiredVehicles').optional().isArray(),
  // Validates item shape, not just "is an array" — a malformed
  // capacityKg (null/NaN/missing) is now rejected at the edge instead of
  // reaching bucketVehicleCategoryFromCapacity, which also guards it
  // (defense in depth: the controller-level guard is what actually
  // matters, this closes the same hole one layer earlier with a
  // friendlier validation-error response shape).
  body('requiredVehicles.*.capacityKg').optional().isFloat({ min: 1 }),
  body('requiredVehicles.*.count').optional().isInt({ min: 1 }),
  body('requiredHamaliCount').optional().isInt({ min: 0 }),
];

bookingRouter.post(
  '/quote',
  bookingQuoteLimiter,
  pricingRules,
  validate,
  bookingController.quoteBooking
);

bookingRouter.post(
  '/',
  bookingCreateLimiter,
  [
    ...pricingRules,
    body('cargoDetails.weightKg').isFloat({ min: 0 }),
    // SIH26089 — all three optional, self-declared by the customer. See
    // Booking.ts's own doc comment on why ewayBillNumber is never verified
    // against a real GSTN record.
    body('cargoDetails.goodsType').optional().isIn(GOODS_TYPES),
    body('cargoDetails.estimatedValueRupees').optional().isFloat({ min: 0 }),
    body('cargoDetails.ewayBillNumber').optional().isString().trim().isLength({ max: 50 }),
    // Phase 6 — scheduled booking. Absent = instant (unchanged). Bounds
    // (30 min .. 14 days out) are enforced again in the controller with a
    // friendlier per-case message; this is just the shape check.
    body('scheduledFor').optional().isISO8601(),
    // Phase 6.2 — load board with bidding. Absent/false = unchanged
    // existing behaviour; the combo/scheduled scope restriction is
    // enforced in the controller (needs both fields together to check).
    body('openForBidding').optional().isBoolean(),
  ],
  validate,
  bookingController.createBooking
);

bookingRouter.get('/', bookingController.listMyBookings);
// Must be registered BEFORE '/:id' — Express matches routes in
// registration order, and '/:id' would otherwise swallow this path,
// treating "frequent-routes" as an :id and failing isMongoId() with a
// confusing 400 instead of ever reaching this handler.
bookingRouter.get('/frequent-routes', bookingController.getMyFrequentRoutes);
bookingRouter.get('/:id', [param('id').isMongoId()], validate, bookingController.getMyBooking);
// Phase 6.4 — a distinct two-segment path ('/:id/tax-invoice'), so there's
// no route-ordering ambiguity with the single-segment '/:id' above the way
// '/frequent-routes' has with it (that one has to be registered first —
// see its own comment further up); order relative to '/:id' doesn't matter
// here.
bookingRouter.get(
  '/:id/tax-invoice',
  [param('id').isMongoId()],
  validate,
  bookingController.downloadTaxInvoice
);
bookingRouter.patch(
  '/:id/cancel',
  [param('id').isMongoId()],
  validate,
  bookingController.cancelMyBooking
);
