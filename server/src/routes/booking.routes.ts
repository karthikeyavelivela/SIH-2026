import { Router } from 'express';
import { body, param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
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

bookingRouter.post(
  '/',
  [
    body('type').isIn(['truck', 'hamali', 'combo']),
    body('region').isString().trim().isLength({ min: 1 }),
    body('cargoDetails.weightKg').isFloat({ min: 0 }),
    ...pointRule('pickupLocation'),
    ...pointRule('dropLocation'),
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
  ],
  validate,
  bookingController.createBooking
);

bookingRouter.get('/', bookingController.listMyBookings);
bookingRouter.get('/:id', [param('id').isMongoId()], validate, bookingController.getMyBooking);
bookingRouter.patch(
  '/:id/cancel',
  [param('id').isMongoId()],
  validate,
  bookingController.cancelMyBooking
);
