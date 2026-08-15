import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { authRouter } from './routes/auth.routes';
import { adminRouter } from './routes/admin.routes';
import { fareRuleRouter } from './routes/fareRule.routes';
import { geocodeRouter } from './routes/geocode.routes';
import { bookingRouter } from './routes/booking.routes';
import { availabilityRouter } from './routes/availability.routes';
import { requestsRouter } from './routes/requests.routes';
import { muthaRouter } from './routes/mutha.routes';
import { earningsRouter } from './routes/earnings.routes';
import { vehicleRouter } from './routes/vehicle.routes';
import { paymentRouter } from './routes/payment.routes';
import { ratingRouter } from './routes/rating.routes';
import { complaintRouter } from './routes/complaint.routes';
import { adminComplaintRouter } from './routes/adminComplaint.routes';
import { incentiveRouter } from './routes/incentive.routes';
import { ApiError } from './utils/ApiError';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
// Captures the raw request body alongside Express's parsed JSON — the
// Razorpay webhook handler needs the exact raw bytes to verify the HMAC
// signature (parsed-then-restringified JSON is not guaranteed to match
// byte-for-byte, which would break signature verification).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  })
);
app.use(cookieParser());

app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));
app.use('/api/auth', authRouter);
// More-specific /api/admin/* sub-resource routers MUST be mounted before
// the general /api/admin router below. Express's app.use() matches by path
// PREFIX, so if the broader router were registered first, its own
// router-level middleware (verifyJwt/requireRole) would run for every
// request under the prefix — including sub-resource paths — before Express
// ever reaches the more specific router; today that's merely a harmless
// double auth-check, but it would become a real bug the moment adminRouter
// grows any route shape (a param route, a catch-all) that could
// accidentally match a sub-resource path first. Keep this ordering for any
// future /api/admin/<resource> router added in later phases.
app.use('/api/admin/fare-rules', fareRuleRouter);
app.use('/api/admin/complaints', adminComplaintRouter);
app.use('/api/admin/incentives', incentiveRouter);
app.use('/api/admin', adminRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/mutha', muthaRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api/vehicles', vehicleRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/ratings', ratingRouter);
app.use('/api/complaints', complaintRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// Central error handler — never leaks stack traces or internals to the client.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
