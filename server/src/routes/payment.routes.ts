import { Router } from 'express';
import { param } from 'express-validator';
import { z } from 'zod';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validate } from '../middleware/validate';
import { validateZod, objectId } from '../middleware/zod';
import { paymentLimiter } from '../middleware/rateLimit';
import * as paymentController from '../controllers/payment.controller';
import { env } from '../config/env';

export function buildPaymentRouter(opts: { mockPayments: boolean }): Router {
  const paymentRouter = Router();

  // Webhook is NOT behind verifyJwt — Razorpay calls this directly, it has
  // no user session. Trust comes entirely from the HMAC signature check
  // inside the handler, not from auth middleware.
  paymentRouter.post('/webhook', paymentController.paymentWebhook);

  paymentRouter.use(verifyJwt);

  // COD confirm/list are the worker-facing routes on this otherwise
  // customer-only router — registered above the blanket customer gate below
  // so their own role check (driver/hamali, never customer) applies.
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
    paymentLimiter,
    [param('bookingId').isMongoId()],
    validate,
    paymentController.createPaymentOrder
  );
  paymentRouter.post(
    '/:bookingId/verify',
    paymentLimiter,
    validateZod({
      params: z.object({ bookingId: objectId }),
      body: z.object({
        razorpay_order_id: z.string().min(1).max(64),
        razorpay_payment_id: z.string().min(1).max(64),
        razorpay_signature: z.string().min(1).max(256),
      }),
    }),
    paymentController.verifyPayment
  );
  paymentRouter.post(
    '/:bookingId/cod',
    paymentLimiter,
    [param('bookingId').isMongoId()],
    validate,
    paymentController.createCodPayment
  );
  paymentRouter.get('/:bookingId', [param('bookingId').isMongoId()], validate, paymentController.getPaymentForBooking);

  // Mock capture exists only when payments are mocked. Not mounting it at
  // all (rather than mounting it and 404ing inside) means it cannot appear
  // in any route listing or be reached by a misconfigured client when real
  // payments are on.
  if (opts.mockPayments) {
    paymentRouter.post(
      '/:bookingId/mock-capture',
      [param('bookingId').isMongoId()],
      validate,
      paymentController.mockCapturePayment
    );
  }

  return paymentRouter;
}

export const paymentRouter = buildPaymentRouter({ mockPayments: env.MOCK_PAYMENTS });

/** Admin: cash-on-delivery reconciliation. */
export const adminPaymentRouter = Router();
adminPaymentRouter.use(verifyJwt, requireRole('admin'));
adminPaymentRouter.get(
  '/cod-reconciliation',
  validateZod({
    query: z.object({
      from: z.coerce.date(),
      to: z.coerce.date(),
      format: z.enum(['json', 'csv']).optional(),
    }),
  }),
  paymentController.getCodReconciliation
);
