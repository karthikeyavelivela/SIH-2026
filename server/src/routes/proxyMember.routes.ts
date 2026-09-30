import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { verifyJwt } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { validateZod, objectId } from '../middleware/zod';
import { authLimiter, requestsLimiter } from '../middleware/rateLimit';
import { asyncHandler } from '../utils/asyncHandler';
import {
  createProxyMember,
  listProxyMembers,
  uploadKycFor,
  setAvailabilityFor,
  setPayoutFor,
  memberEarnings,
  issueClaimCode,
  startClaim,
  completeClaim,
} from '../services/proxyMember.service';
import type { KycDocumentType } from '@fyro/shared';

/** P1.7 — a society leader managing members who have no phone. */
export const proxyMemberRouter = Router();
proxyMemberRouter.use(verifyJwt, requireRole('mutha_leader'), requestsLimiter);

const member = z.object({ id: objectId });

proxyMemberRouter.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json({ members: await listProxyMembers(req.user!.id) });
  })
);

proxyMemberRouter.post(
  '/',
  validateZod({
    body: z.object({
      name: z.string().trim().min(2).max(100),
      region: z.string().trim().max(100).optional(),
      skills: z.array(z.string().trim().max(40)).max(20).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const m = await createProxyMember(req.user!.id, req.body);
    res.status(201).json({ member: { _id: m._id, name: m.name } });
  })
);

proxyMemberRouter.post(
  '/:id/kyc',
  validateZod({
    params: member,
    // A society member needs Aadhaar and PAN (REQUIRED_KYC_DOCS_BY_ROLE).
    body: z.object({ type: z.enum(['aadhaar', 'pan']), fileBase64: z.string().min(1) }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { type, fileBase64 } = req.body as { type: KycDocumentType; fileBase64: string };
    res.status(200).json({ document: await uploadKycFor(req.user!.id, req.params.id, type, fileBase64) });
  })
);

proxyMemberRouter.patch(
  '/:id/availability',
  validateZod({
    params: member,
    body: z.object({
      status: z.enum(['online', 'offline']),
      location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json(await setAvailabilityFor(req.user!.id, req.params.id, req.body.status, req.body.location));
  })
);

proxyMemberRouter.put(
  '/:id/payout',
  validateZod({
    params: member,
    body: z.object({
      method: z.enum(['bank', 'upi']),
      accountHolderName: z.string().trim().max(100).optional(),
      bankAccountNumber: z.string().trim().regex(/^\d{9,18}$/).optional(),
      ifsc: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(),
      upiId: z.string().trim().regex(/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/).optional(),
      consent: z.boolean(),
    }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { consent, ...details } = req.body;
    res.status(200).json(await setPayoutFor(req.user!.id, req.params.id, details, consent));
  })
);

proxyMemberRouter.get(
  '/:id/earnings',
  validateZod({ params: member }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json(await memberEarnings(req.user!.id, req.params.id));
  })
);

proxyMemberRouter.post(
  '/:id/claim-code',
  validateZod({ params: member }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json(await issueClaimCode(req.user!.id, req.params.id));
  })
);

/**
 * The member claims their account. Public by necessity — they have no login
 * yet — so both steps sit behind the auth rate limiter, and the code itself
 * locks after five wrong attempts.
 */
export const proxyClaimRouter = Router();
proxyClaimRouter.use(authLimiter);
const claimCode = z.string().trim().min(6).max(12);
const indianMobile = z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number');

proxyClaimRouter.post(
  '/start',
  validateZod({ body: z.object({ code: claimCode, phone: indianMobile }) }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json(await startClaim(req.body.code, req.body.phone));
  })
);

proxyClaimRouter.post(
  '/complete',
  validateZod({
    body: z.object({ code: claimCode, phone: indianMobile, otp: z.string().trim().regex(/^\d{4,8}$/), password: z.string().min(8).max(128) }),
  }),
  asyncHandler(async (req: Request, res: Response) => {
    res.status(200).json(await completeClaim(req.body.code, req.body.phone, req.body.otp, req.body.password));
  })
);
