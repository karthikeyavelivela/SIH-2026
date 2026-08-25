import { Router } from 'express';
import { param } from 'express-validator';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import * as paymentController from '../controllers/payment.controller';

export const paymentRouter = Router();

// Webhook is NOT behind verifyJwt — Razorpay calls this directly, it has
// no user session. Trust comes entirely from the HMAC signature check
// inside the handler, not from auth middleware.
paymentRouter.post('/webhook', paymentController.paymentWebhook);

paymentRouter.use(verifyJwt);

// COD confirm/list are the worker-facing routes on this otherwise
// customer-only router — moved above the blanket customer gate below so
// their own role check (driver/hamali, never customer) actually applies.
// See Payment.codConfirmedBy's doc comment for why this can't be the
// customer confirming their own cash payment. Registered before the
// param-only '/:bookingId/cod/confirm' pattern isn't actually ambiguous
// with a literal '/cod/pending' path since Express matches the more
// specific '/:bookingId/...' shape only when the first segment is present
// — but '/cod/pending' has no bookingId segment at all, so it's a
// completely distinct route, not a collision.
const workerCodRoles = requireRole('driver', 'hamali_solo', 'mutha_member', 'mutha_leader');
paymentRouter.get('/cod/pending', workerCodRoles, paymentController.listPendingCodForWorker);
paymentRouter.post(
  '/:bookingId/cod/confirm',
  workerCodRoles,
  [param('bookingId').isMongoId()],
  validate,
  paymentController.confirmCodPayment
);

paymentRouter.use(requireRole('customer'));

paymentRouter.post(
  '/order/:bookingId',
  [param('bookingId').isMongoId()],
  validate,
  paymentController.createPaymentOrder
);
paymentRouter.post(
  '/:bookingId/cod',
  [param('bookingId').isMongoId()],
  validate,
  paymentController.createCodPayment
);
paymentRouter.get('/:bookingId', [param('bookingId').isMongoId()], validate, paymentController.getPaymentForBooking);
paymentRouter.post(
  '/:bookingId/mock-capture',
  [param('bookingId').isMongoId()],
  validate,
  paymentController.mockCapturePayment
);
