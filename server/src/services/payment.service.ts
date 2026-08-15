import crypto from 'crypto';
import { env } from '../config/env';

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
}

/**
 * Same mock/real split already established by cloudinary.service.ts:
 * MOCK_EXTERNAL_SERVICES=true (or missing keys) returns a deterministic
 * fake order instead of calling the real Razorpay API, so the rest of the
 * codebase is written against the real integration shape before live
 * Razorpay credentials exist. This app never executes a real money
 * movement in mock mode — no live keys are wired here, and the security
 * rule against real financial transactions applies regardless.
 */
export async function createOrder(bookingId: string, amountRupees: number): Promise<RazorpayOrder> {
  const amountPaise = Math.round(amountRupees * 100);

  if (env.MOCK_EXTERNAL_SERVICES || !env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return {
      id: `order_mock_${bookingId}_${Date.now()}`,
      amount: amountPaise,
      currency: 'INR',
    };
  }

  // Real integration point — wired once RAZORPAY_* env vars are supplied.
  const Razorpay = (await import('razorpay')).default;
  const instance = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const order = await instance.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: bookingId,
  });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

/**
 * Verifies a Razorpay webhook's HMAC-SHA256 signature against the raw
 * request body — the standard Razorpay webhook verification recipe.
 * Always returns true in mock mode (there is no real signature to check
 * against a mock order), so the mock-capture path below can still be
 * exercised end-to-end without a live webhook secret.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (env.MOCK_EXTERNAL_SERVICES || !env.RAZORPAY_WEBHOOK_SECRET) return true;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}
