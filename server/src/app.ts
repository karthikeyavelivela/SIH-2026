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
import { incentiveRouter, workerIncentiveRouter } from './routes/incentive.routes';
import { regionRouter } from './routes/region.routes';
import { auditLogRouter } from './routes/auditLog.routes';
import { adminStatsRouter } from './routes/adminStats.routes';
import { savedAddressRouter } from './routes/savedAddress.routes';
import { fleetRouter } from './routes/fleet.routes';
import { warehouseHubRouter } from './routes/warehouseHub.routes';
import { insuranceRouter, adminInsuranceRouter } from './routes/insurance.routes';
import { trainingRouter } from './routes/training.routes';
import { referralRouter, adminReferralRouter } from './routes/referral.routes';
import { loadManifestRouter } from './routes/loadManifest.routes';
import { kycRouter } from './routes/kyc.routes';
import { kycDocumentRouter } from './routes/kycDocument.routes';
import { hamaliProfileRouter } from './routes/hamaliProfile.routes';
import { agentsRouter } from './routes/agents.routes';
import { ledgerRouter } from './routes/ledger.routes';
import { disputeRouter, myDisputeRouter } from './routes/dispute.routes';
import { fraudRouter } from './routes/fraud.routes';
import { payoutRouter } from './routes/payout.routes';
import { surgeZoneRouter } from './routes/surgeZone.routes';
import { analyticsRouter } from './routes/analytics.routes';
import { opsHubRouter } from './routes/opsHub.routes';
import { reportsRouter } from './routes/reports.routes';
import { notificationRouter } from './routes/notification.routes';
import { loadboardRouter } from './routes/loadboard.routes';
import { adminFederationRouter, federationRouter } from './routes/federation.routes';
import { governanceRouter } from './routes/governance.routes';
import { ApiError } from './utils/ApiError';
import { globalMutationLimiter } from './middleware/rateLimit';
import { t } from './i18n/messages';
import { resolveLocale } from './i18n/resolveLocale';

export const app = express();

// Render (and Vercel-style single-hop reverse proxies generally) sits in
// front of this process — without this, req.ip resolves to the proxy's
// own address for EVERY request, not the real client. Found live this
// session while auditing rate-limit coverage: every one of this app's
// per-IP-fallback rate limiters (rateLimit.ts) and the Phase 6
// signupIp-based rapid-account-creation fraud detector
// (fraudDetection.service.ts) depend on req.ip being the real caller —
// unset, they'd have silently treated every unauthenticated request (and
// every real, distinct signup) as coming from one shared address. `1`
// trusts exactly one hop, matching Render's/most PaaS's single reverse
// proxy — not a wildcard trust of the whole X-Forwarded-For chain.
app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
// Captures the raw request body alongside Express's parsed JSON — the
// Razorpay webhook handler needs the exact raw bytes to verify the HMAC
// signature (parsed-then-restringified JSON is not guaranteed to match
// byte-for-byte, which would break signature verification).
app.use(
  express.json({
    // Default is 100kb. Every base64-data-URL file upload in this codebase
    // (proof photos up to 5MB, manifest signatures up to 2MB, KYC documents
    // up to 8MB — each enforced by its own controller-level check) sends
    // the file inside the JSON body, base64-inflated (~33% larger) plus a
    // JSON envelope. Left at the default, Express itself 413s any
    // realistically-sized real photo before a request ever reaches a
    // controller — found while wiring up KYC document upload (Phase 1.2 of
    // AUDIT_REPORT.md's remediation), because this session's only prior
    // live test of the pattern used a trivial few-byte 1x1 PNG that never
    // exercised the limit. 12mb covers the largest declared cap (8MB) with
    // headroom for base64 + JSON overhead.
    limit: '12mb',
    verify: (req, _res, buf) => {
      (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
    },
  })
);
app.use(cookieParser());

// Global floor under every route-specific rate limiter — see
// globalMutationLimiter's own doc comment in rateLimit.ts for why this
// exists (22 route files with mutating endpoints and no limiter at all,
// found live this session). Applied once, here, rather than in each of
// those 22 files.
app.use(globalMutationLimiter);

// Every /api response is live, per-request app state (booking status,
// availability, requests feed, earnings...), never something safe for a
// browser to reuse from its disk cache on a plain GET. Without this,
// nothing here sent an explicit Cache-Control, so a browser was free to
// heuristically cache a GET and serve it stale later — confirmed live
// (GET /api/vehicles/me returned pre-PATCH data well after the real
// update landed). The client's fetch wrapper now also sets
// cache:'no-store'; this is the server-side half of the same fix so any
// other client (mobile app, future one) gets the same guarantee.
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

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
app.use('/api/incentives', workerIncentiveRouter);
app.use('/api/admin/regions', regionRouter);
app.use('/api/admin/audit-log', auditLogRouter);
app.use('/api/admin/stats', adminStatsRouter);
app.use('/api/admin/insurance', adminInsuranceRouter);
app.use('/api/admin/referrals', adminReferralRouter);
app.use('/api/admin/kyc-queue', kycRouter);
app.use('/api/kyc/documents', kycDocumentRouter);
app.use('/api/hamali-profile', hamaliProfileRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/admin/ledger', ledgerRouter);
app.use('/api/admin/disputes', disputeRouter);
app.use('/api/disputes', myDisputeRouter);
app.use('/api/admin/fraud', fraudRouter);
app.use('/api/admin/payouts', payoutRouter);
app.use('/api/admin/surge-zones', surgeZoneRouter);
app.use('/api/admin/analytics', analyticsRouter);
app.use('/api/admin/ops-hub', opsHubRouter);
app.use('/api/admin/reports', reportsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api/bookings', bookingRouter);
app.use('/api/availability', availabilityRouter);
app.use('/api/requests', requestsRouter);
app.use('/api/loadboard', loadboardRouter);
app.use('/api/admin/federations', adminFederationRouter);
app.use('/api/federation', federationRouter);
app.use('/api/governance', governanceRouter);
app.use('/api/mutha', muthaRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api/vehicles', vehicleRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/ratings', ratingRouter);
app.use('/api/complaints', complaintRouter);
app.use('/api/addresses', savedAddressRouter);
app.use('/api/fleet', fleetRouter);
app.use('/api/warehouse-hub', warehouseHubRouter);
app.use('/api/insurance', insuranceRouter);
app.use('/api/training', trainingRouter);
app.use('/api/referrals', referralRouter);
app.use('/api/load-manifests', loadManifestRouter);
app.use('/api/notifications', notificationRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// Central error handler — never leaks stack traces or internals to the client.
// Phase 2 (server-side i18n): translates the small set of most-common
// literal ApiError messages via server/src/i18n/messages.ts's exact-string
// table; anything not in that table falls back to its original English
// text (t() itself is a no-op for keys it doesn't recognize) — see that
// file's doc comment for why this isn't every message in the codebase.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    const locale = resolveLocale(req);
    res.status(err.statusCode).json({ error: t(err.message, locale), details: err.details });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  const locale = resolveLocale(req);
  res.status(500).json({ error: t('Internal server error', locale) });
});
