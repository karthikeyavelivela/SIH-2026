import { Request, Response, NextFunction } from 'express';
import { CONSENT_PURPOSES, type ConsentPurpose } from '@fyro/shared';
import { ApiError } from '../utils/ApiError';
import { recordConsent, type ConsentChoice } from '../services/consent.service';

/**
 * Signup bodies may carry `consent: { purposes: {...} }`. When the signup
 * succeeds (a 201 carrying the new user), the decision is stored before the
 * response leaves, under the new account's id. A signup that sends no
 * consent still works (older clients, tests); the app then asks for it on
 * first sign-in. A signup that sends one with a required purpose off is
 * refused before any account is created.
 */
export function withSignupConsent(req: Request, res: Response, next: NextFunction) {
  const raw = (req.body as { consent?: { purposes?: Record<string, unknown> } }).consent;
  if (!raw) return next();

  const choice: ConsentChoice = {};
  for (const p of CONSENT_PURPOSES) {
    const v = raw.purposes?.[p];
    if (typeof v === 'boolean') choice[p as ConsentPurpose] = v;
  }
  const required = ['identity_verification', 'matching_location', 'payments', 'welfare_administration'] as const;
  if (required.some((p) => choice[p] !== true)) {
    return next(new ApiError(400, 'The required consents must be accepted to create an account'));
  }

  const original = res.json.bind(res);
  res.json = ((body: unknown) => {
    const created = res.statusCode === 201 ? (body as { user?: { _id?: unknown } })?.user?._id : undefined;
    if (!created) return original(body);
    recordConsent(String(created), choice, 'signup')
      .catch(() => undefined)
      .finally(() => original(body));
    return res;
  }) as typeof res.json;
  next();
}
