import crypto from 'crypto';
import { env } from '../config/env';
import { Payment, IPayment } from '../models/Payment';
import { Booking } from '../models/Booking';
import { writeLedgerEntry } from './ledger.service';

export interface RazorpayOrder {
  id: string;
  amount: number; // paise
  currency: string;
}

/**
 * Creates a Razorpay order, or a clearly-labelled fake one when
 * MOCK_PAYMENTS is on.
 *
 * With MOCK_PAYMENTS off this ALWAYS talks to Razorpay; missing keys are an
 * error, never a silent fall-back to a fake order (production refuses to
 * boot in that state — see paymentConfigProblems in config/env.ts). The keys
 * are expected to be TEST-mode keys for the hackathon deployment; nothing in
 * this code distinguishes test from live, Razorpay does.
 */
export async function createOrder(bookingId: string, amountRupees: number): Promise<RazorpayOrder> {
  const amountPaise = Math.round(amountRupees * 100);

  if (env.MOCK_PAYMENTS) {
    return { id: `order_mock_${bookingId}_${Date.now()}`, amount: amountPaise, currency: 'INR' };
  }
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  }

  const Razorpay = (await import('razorpay')).default;
  const instance = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const order = await instance.orders.create({ amount: amountPaise, currency: 'INR', receipt: bookingId });
  return { id: order.id, amount: Number(order.amount), currency: order.currency };
}

/**
 * Constant-time comparison of two hex digests that never throws.
 *
 * crypto.timingSafeEqual throws when the buffers differ in length, which
 * turned a malformed signature header into a 500 instead of a 400. The
 * length check comes first; a mismatch is simply "not equal".
 */
export function safeHexEqual(expected: string, received: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verifies a Razorpay webhook's HMAC-SHA256 signature over the raw body.
 *
 * Mock mode without a secret accepts (there is nothing real to verify
 * against a fake order). Any configured secret is ALWAYS checked, mock or
 * not. Real mode without a secret rejects everything — and production
 * refuses to boot in that state, so this branch only matters in dev.
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return env.MOCK_PAYMENTS;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeHexEqual(expected, signature);
}

/**
 * Verifies the signature Razorpay Checkout hands back to the browser:
 * HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET).
 */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return safeHexEqual(expected, signature);
}

/**
 * Records a payment as captured and posts its revenue — exactly once.
 *
 * Shared by the Checkout verify endpoint, the webhook and the mock path, so
 * the three cannot drift. The pending -> success transition is a single
 * conditional update: two deliveries racing each other (the browser's
 * verify call and Razorpay's webhook routinely arrive together) produce one
 * transition and one ledger posting, never two.
 *
 * Returns whether THIS call performed the capture.
 */
export async function capturePayment(
  paymentId: string,
  razorpayPaymentId?: string,
  extra: Record<string, unknown> = {}
): Promise<{ payment: IPayment | null; captured: boolean }> {
  const updated = await Payment.findOneAndUpdate(
    { _id: paymentId, status: { $ne: 'success' } },
    { status: 'success', capturedAt: new Date(), ...(razorpayPaymentId ? { razorpayPaymentId } : {}), ...extra },
    { new: true }
  );
  if (!updated) {
    return { payment: await Payment.findById(paymentId), captured: false };
  }
  await postRevenue(updated);
  return { payment: updated, captured: true };
}

/** Marks a pending payment failed. Never downgrades a captured one. */
export async function failPayment(paymentId: string): Promise<void> {
  await Payment.updateOne({ _id: paymentId, status: 'pending' }, { status: 'failed' });
}

/**
 * The 'revenue' posting for a captured payment. Called only from a real
 * pending/failed -> success transition, so a redelivered webhook or a
 * repeated verify can never post twice.
 */
export async function postRevenue(payment: { _id: unknown; bookingId: unknown; amount: number }): Promise<void> {
  const booking = await Booking.findById(payment.bookingId).select('region').lean();
  await writeLedgerEntry({
    type: 'revenue',
    entityType: 'Payment',
    entityId: String(payment._id),
    amount: payment.amount,
    description: `Payment received for booking ${String(payment.bookingId)}`,
    status: 'posted',
    region: booking?.region,
  });
}
