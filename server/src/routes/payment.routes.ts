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

paymentRouter.use(verifyJwt, requireRole('customer'));

paymentRouter.post(
  '/order/:bookingId',
  [param('bookingId').isMongoId()],
  validate,
  paymentController.createPaymentOrder
);
paymentRouter.get('/:bookingId', [param('bookingId').isMongoId()], validate, paymentController.getPaymentForBooking);
paymentRouter.post(
  '/:bookingId/mock-capture',
  [param('bookingId').isMongoId()],
  validate,
  paymentController.mockCapturePayment
);
