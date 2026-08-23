import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { createOrder } from '../services/payment.service';
import { writeLedgerEntry } from '../services/ledger.service';
import { env } from '../config/env';

/**
 * Posts the 'revenue' half of the money chain — ledger.service.ts's own
 * doc comment flagged this as "not yet wired into real booking/payment/
 * payout flows" (a follow-up that was never actually done); the payout
 * side (payout.controller.ts) and the parametric-insurance side
 * (parametricInsurance.service.ts) were both real, but a customer's own
 * payment never posted anything, so GET /api/admin/ledger's revenue total
 * was silently always zero regardless of how much money actually moved.
 * Called only from a genuine pending/failed -> success transition (never
 * on an already-success payment) so a redelivered webhook or a stale
 * mock-capture retry can never double-post the same revenue twice.
 */
async function postRevenueLedgerEntry(payment: { _id: unknown; bookingId: unknown; amount: number }): Promise<void> {
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

/**
 * POST /api/payments/order — customer creates (or re-fetches, idempotent)
 * a payment order for their own completed booking. Amount is ALWAYS the
 * server-stored fareBreakdown.total from the booking, never a
 * client-supplied figure — same "money only ever computed/read
 * server-side" rule the fare engine already enforces.
 */
export const createPaymentOrder = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'completed') {
    throw new ApiError(400, 'Can only pay for a completed booking');
  }

  const existing = await Payment.findOne({ bookingId: booking._id, status: { $in: ['pending', 'success'] } }).sort({
    createdAt: -1,
  });
  if (existing?.status === 'success') {
    res.status(200).json({ payment: existing });
    return;
  }

  const order = await createOrder(booking._id.toString(), booking.fareBreakdown.total);
  let payment;
  if (existing) {
    existing.razorpayOrderId = order.id;
    await existing.save();
    payment = existing;
  } else {
    payment = await Payment.create({
      bookingId: booking._id,
      amount: booking.fareBreakdown.total,
      status: 'pending',
      razorpayOrderId: order.id,
    });
  }

  res.status(201).json({ payment, order });
});

/**
 * GET /api/payments/:bookingId — the caller's own payment status for a
 * booking (customer-scoped by customerId, same IDOR discipline as every
 * other booking-scoped route).
 */
export const getPaymentForBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  const payment = await Payment.findOne({ bookingId: booking._id }).sort({ createdAt: -1 });
  res.status(200).json({ payment });
});

/**
 * POST /api/payments/webhook — Razorpay's real webhook shape: raw body +
 * X-Razorpay-Signature header, verified via HMAC before trusting any of
 * the payload (see payment.service.verifyWebhookSignature). Idempotent on
 * razorpayOrderId so a redelivered webhook can't double-process.
 */
export const paymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  const { verifyWebhookSignature } = await import('../services/payment.service');
  if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  const event = req.body?.event;
  const orderId = req.body?.payload?.payment?.entity?.order_id;
  const paymentId = req.body?.payload?.payment?.entity?.id;
  if (!orderId) {
    res.status(200).json({ ok: true }); // acknowledge unrelated events without erroring the sender
    return;
  }

  const payment = await Payment.findOne({ razorpayOrderId: orderId });
  if (!payment) {
    res.status(200).json({ ok: true });
    return;
  }

  const wasAlreadySuccess = payment.status === 'success';

  if (event === 'payment.captured') {
    payment.status = 'success';
    payment.razorpayPaymentId = paymentId;
  } else if (event === 'payment.failed') {
    payment.status = 'failed';
  }
  await payment.save();

  if (event === 'payment.captured' && !wasAlreadySuccess) {
    await postRevenueLedgerEntry(payment);
  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/payments/:bookingId/mock-capture — MOCK-MODE ONLY stand-in for
 * a real Razorpay webhook round trip, so the payment flow is demoable
 * end-to-end without a public webhook URL or live keys. 404s (as if the
 * route didn't exist) outside mock mode rather than silently no-op'ing,
 * so it can never be mistaken for a real payment confirmation path.
 */
export const mockCapturePayment = asyncHandler(async (req: Request, res: Response) => {
  if (!env.MOCK_EXTERNAL_SERVICES) throw new ApiError(404, 'Not found');

  const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const payment = await Payment.findOne({ bookingId: booking._id }).sort({ createdAt: -1 });
  if (!payment) throw new ApiError(404, 'No payment order found for this booking — create one first');

  const wasAlreadySuccess = payment.status === 'success';
  payment.status = 'success';
  payment.razorpayPaymentId = `pay_mock_${Date.now()}`;
  await payment.save();

  if (!wasAlreadySuccess) {
    await postRevenueLedgerEntry(payment);
  }

  res.status(200).json({ payment });
});
