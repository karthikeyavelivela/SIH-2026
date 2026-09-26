import net from 'net';
import type { Request } from 'express';
import { env } from '../config/env';

/**
 * The address to hold a caller to, for rate limits and signup fraud checks.
 *
 * Measured in production: behind Render's Cloudflare edge, req.ip resolves
 * to a Cloudflare address that changes per request, so every per-IP limit
 * was keyed on a moving target and never tripped. Cloudflare writes the
 * real caller into CF-Connecting-IP (and overwrites any value a client
 * sent), so with TRUST_CLOUDFLARE=true that header is used — but only if it
 * is a syntactically valid IP; anything else falls back to req.ip rather
 * than trusting an arbitrary string as an identity.
 *
 * Only turn TRUST_CLOUDFLARE on for a deployment that is actually behind
 * Cloudflare: anywhere else a client can set the header themselves.
 * Requests arriving through the web client's Vercel proxy carry Vercel's
 * egress address here, not the end user's; per-account limits (keyed on the
 * user or phone) remain the protection that does not depend on this.
 */
export function clientIp(req: Request): string {
  if (env.TRUST_CLOUDFLARE) {
    const header = req.headers['cf-connecting-ip'];
    const value = Array.isArray(header) ? header[0] : header;
    if (value && net.isIP(value.trim())) return value.trim();
  }
  return req.ip ?? 'unknown';
}
