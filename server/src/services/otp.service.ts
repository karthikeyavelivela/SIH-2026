import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { env } from '../config/env';

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;
const BCRYPT_COST = 10; // an OTP is short-lived and low-entropy vs a password — 10 is plenty, cheaper than 12

export interface GeneratedOtp {
  code: string;
  hash: string;
  expiresAt: Date;
  /** Only set in mock mode — a real integration never returns the code itself. */
  devCode?: string;
}

/**
 * Same MOCK_EXTERNAL_SERVICES-gated shape as payment.service.ts's
 * createOrder and cloudinary.service.ts's uploadImage: no SMS gateway
 * (Twilio/MSG91/etc.) is wired into this codebase at all — confirmed
 * during AUDIT_REPORT.md's audit (client/src/app/otp-verification/page.tsx
 * is a visual-only demo with its own comment admitting no real backend
 * exists). Rather than silently no-op an OTP flow that LOOKS real, this
 * throws in real (non-mock) mode until an actual SMS provider is
 * configured — the same honesty rule Razorpay/Cloudinary's mock/real split
 * already enforces elsewhere in this codebase. Mock mode returns the code
 * directly in devCode so the flow is genuinely testable end-to-end without
 * a live SMS bill.
 */
export async function generateOtp(): Promise<GeneratedOtp> {
  const code = crypto.randomInt(100000, 999999).toString();
  const hash = await bcrypt.hash(code, BCRYPT_COST);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  return { code, hash, expiresAt, devCode: env.MOCK_EXTERNAL_SERVICES ? code : undefined };
}

/**
 * Sends the OTP via SMS. Mock mode is a no-op (the caller already has
 * devCode to hand back for testing). Real mode has no provider wired up
 * yet — throws rather than pretending to have sent something that never
 * left the server, so a misconfigured production deploy fails loudly at
 * the point of use instead of silently stranding a user who never
 * receives a code they were told to expect.
 */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (env.MOCK_EXTERNAL_SERVICES) return;
  void phone;
  void code;
  throw new Error('No SMS provider is configured — set MOCK_EXTERNAL_SERVICES=true for development, or wire a real gateway here before enabling this in production.');
}

export async function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}
