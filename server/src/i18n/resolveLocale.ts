import type { Request } from 'express';
import type { AppLocale } from '@fyro/shared';

const KNOWN_LOCALES: AppLocale[] = ['en', 'te', 'hi'];

/**
 * Resolution order: the authenticated user's own record (embedded in the
 * JWT — see JwtAccessPayload's doc comment) → an Accept-Language header for
 * pre-auth requests (signup/login error text, where there's no user yet) →
 * English. Never throws, never returns anything outside AppLocale.
 */
export function resolveLocale(req: Request): AppLocale {
  if (req.user?.locale && KNOWN_LOCALES.includes(req.user.locale)) return req.user.locale;

  const header = req.headers['accept-language'];
  const raw = Array.isArray(header) ? header[0] : header;
  if (raw) {
    const primary = raw.split(',')[0]?.trim().toLowerCase().split('-')[0];
    if (primary && (KNOWN_LOCALES as string[]).includes(primary)) return primary as AppLocale;
  }

  return 'en';
}
