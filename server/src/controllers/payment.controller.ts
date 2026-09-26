import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';
import { LedgerEntry } from '../models/LedgerEntry';
import {
  createOrder,
  capturePayment,
  failPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../services/payment.service';
import { env } from '../config/env';

/**
 * POST /api/payments/order/:bookingId — customer creates (or re-fetches,
 * idempotent) a payment order for their own completed booking. Amount is
 * ALWAYS the server-stored fareBreakdown.total, never a client figure.
 *
 * The response carries what the browser needs to open Razorpay Checkout:
 * the order and the PUBLIC key id (never the secret), plus `mock` so the
 * client knows whether to open Checkout at all.
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
    res.status(200).json({ payment: existing, mock: env.MOCK_PAYMENTS });
    return;
  }
  if (existing?.method === 'cod') {
    throw new ApiError(409, 'Cash on delivery was chosen for this booking');
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

  res.status(201).json({
    payment,
    order,
    mock: env.MOCK_PAYMENTS,
    keyId: env.MOCK_PAYMENTS ? null : env.RAZORPAY_KEY_ID,
  });
});

/**
 * POST /api/payments/:bookingId/verify — the browser's half of a Checkout
 * payment: Razorpay hands the page order_id, payment_id and a signature;
 * the server checks HMAC_SHA256(order_id|payment_id, KEY_SECRET) and only
 * then records the capture. The webhook may arrive first or second — both
 * go through capturePayment, which is idempotent.
 */
export const verifyPayment = asyncHandler(async (req: Request, res: Response) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };
  const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user!.id }).select('_id').lean();
  if (!booking) throw new ApiError(404, 'Booking not found');

  const payment = await Payment.findOne({ bookingId: booking._id, razorpayOrderId: razorpay_order_id });
  if (!payment) throw new ApiError(400, 'This order does not belong to this booking');

  if (!verifyCheckoutSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    throw new ApiError(400, 'Payment signature did not verify');
  }

  const { payment: captured } = await capturePayment(payment._id.toString(), razorpay_payment_id);
  res.status(200).json({ payment: captured });
});

/**
 * POST /api/payments/:bookingId/cod — customer chooses cash on delivery.
 * Status stays 'pending' until the worker who holds the cash confirms it.
 */
export const createCodPayment = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'completed') {
    throw new ApiError(400, 'Can only pay for a completed booking');
  }

  const existing = await Payment.findOne({ bookingId: booking._id, status: { $in: ['pending', 'success'] } }).sort({
    createdAt: -1,
  });
  if (existing) {
    res.status(200).json({ payment: existing });
    return;
  }

  const payment = await Payment.create({
    bookingId: booking._id,
    amount: booking.fareBreakdown.total,
    method: 'cod',
    status: 'pending',
  });

  res.status(201).json({ payment });
});

/**
 * POST /api/payments/:bookingId/cod/confirm — the assigned worker who
 * collected the cash confirms receipt. Never callable by the customer.
 */
export const confirmCodPayment = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findById(req.params.bookingId).select('assignedDriverIds assignedHamaliIds status');
  if (!booking) throw new ApiError(404, 'Booking not found');

  const workerId = req.user!.id;
  const isAssigned =
    booking.assignedDriverIds.some((id) => id.toString() === workerId) ||
    booking.assignedHamaliIds.some((id) => id.toString() === workerId);
  if (!isAssigned) throw new ApiError(403, 'Not assigned to this booking');

  const payment = await Payment.findOne({ bookingId: booking._id, method: 'cod' }).sort({ createdAt: -1 });
  if (!payment) throw new ApiError(404, 'No cash-on-delivery payment found for this booking');

  const { payment: captured } = await capturePayment(payment._id.toString(), undefined, {
    codConfirmedBy: new Types.ObjectId(workerId),
  });
  res.status(200).json({ payment: captured });
});

/**
 * GET /api/payments/cod/pending — completed bookings assigned to the
 * calling worker whose cash payment still awaits their confirmation.
 */
export const listPendingCodForWorker = asyncHandler(async (req: Request, res: Response) => {
  const workerId = req.user!.id;
  const bookings = await Booking.find({
    status: 'completed',
    $or: [{ assignedDriverIds: workerId }, { assignedHamaliIds: workerId }],
  })
    .select('_id pickupLocation dropLocation fareBreakdown')
    .lean();
  const bookingIds = bookings.map((b) => b._id);

  const payments = await Payment.find({ bookingId: { $in: bookingIds }, method: 'cod', status: 'pending' }).lean();
  const bookingById = new Map(bookings.map((b) => [b._id.toString(), b]));

  const items = [];
  for (const payment of payments) {
    const booking = bookingById.get(payment.bookingId.toString());
    if (booking) items.push({ payment, booking });
  }

  res.status(200).json({ items });
});

/** GET /api/payments/:bookingId — the caller's own payment status for a booking. */
export const getPaymentForBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  const payment = await Payment.findOne({ bookingId: booking._id }).sort({ createdAt: -1 });
  res.status(200).json({ payment, mock: env.MOCK_PAYMENTS });
});

/**
 * POST /api/payments/webhook — Razorpay's server-to-server notification.
 * Public by necessity; trust comes only from the HMAC over the raw body.
 * A bad or missing signature is a 400 and changes nothing. Idempotent.
 */
export const paymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers['x-razorpay-signature'];
  const rawBody = (req as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (typeof signature !== 'string' || !verifyWebhookSignature(rawBody, signature)) {
    throw new ApiError(400, 'Invalid webhook signature');
  }

  const event = req.body?.event;
  const orderId = req.body?.payload?.payment?.entity?.order_id;
  const razorpayPaymentId = req.body?.payload?.payment?.entity?.id;
  if (!orderId) {
    res.status(200).json({ ok: true }); // acknowledge unrelated events without erroring the sender
    return;
  }

  const payment = await Payment.findOne({ razorpayOrderId: orderId });
  if (!payment) {
    res.status(200).json({ ok: true });
    return;
  }

  if (event === 'payment.captured' || event === 'order.paid') {
    await capturePayment(payment._id.toString(), razorpayPaymentId);
  } else if (event === 'payment.failed') {
    await failPayment(payment._id.toString());
  }

  res.status(200).json({ ok: true });
});

/**
 * POST /api/payments/:bookingId/mock-capture — MOCK_PAYMENTS only. The
 * route is not even mounted otherwise (payment.routes.ts); the check here
 * is a second line in case it ever is.
 */
export const mockCapturePayment = asyncHandler(async (req: Request, res: Response) => {
  if (!env.MOCK_PAYMENTS) throw new ApiError(404, 'Not found');

  const booking = await Booking.findOne({ _id: req.params.bookingId, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const payment = await Payment.findOne({ bookingId: booking._id }).sort({ createdAt: -1 });
  if (!payment) throw new ApiError(404, 'No payment order found for this booking — create one first');

  const { payment: captured } = await capturePayment(payment._id.toString(), `pay_mock_${Date.now()}`);
  res.status(200).json({ payment: captured });
});

/* ------------------------------------------------ COD reconciliation (admin) */

interface CodRow {
  paymentId: string;
  bookingId: string;
  region: string | null;
  amount: number;
  status: string;
  createdAt: Date;
  capturedAt: Date | null;
  confirmedBy: string | null;
  ledgerPosted: boolean;
}

/**
 * Every cash-on-delivery payment in a date range, and whether the money
 * the worker says they collected reached the ledger.
 *
 * Three buckets matter to whoever reconciles cash: still with the worker
 * (pending), confirmed and posted, and confirmed but NOT posted — the last
 * should always be zero; a non-zero count is a bug or tampering, and is
 * listed so it can be chased.
 */
export async function codReconciliation(from: Date, to: Date) {
  const payments = await Payment.find({ method: 'cod', createdAt: { $gte: from, $lt: to } })
    .sort({ createdAt: 1 })
    .lean();
  const bookingIds = payments.map((p) => p.bookingId);
  const bookings = await Booking.find({ _id: { $in: bookingIds } }).select('region').lean();
  const regionOf = new Map(bookings.map((b) => [b._id.toString(), b.region ?? null]));
  const ledger = await LedgerEntry.find({
    type: 'revenue',
    entityType: 'Payment',
    entityId: { $in: payments.map((p) => p._id) },
  })
    .select('entityId')
    .lean();
  const posted = new Set(ledger.map((l) => l.entityId.toString()));

  const rows: CodRow[] = payments.map((p) => ({
    paymentId: p._id.toString(),
    bookingId: p.bookingId.toString(),
    region: regionOf.get(p.bookingId.toString()) ?? null,
    amount: p.amount,
    status: p.status,
    createdAt: p.createdAt,
    capturedAt: p.capturedAt ?? null,
    confirmedBy: p.codConfirmedBy ? p.codConfirmedBy.toString() : null,
    ledgerPosted: posted.has(p._id.toString()),
  }));

  const sum = (xs: CodRow[]) => Math.round(xs.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  const pending = rows.filter((r) => r.status === 'pending');
  const confirmed = rows.filter((r) => r.status === 'success');
  const unposted = confirmed.filter((r) => !r.ledgerPosted);
  return {
    from,
    to,
    rows,
    totals: {
      count: rows.length,
      pendingCount: pending.length,
      pendingAmount: sum(pending),
      confirmedCount: confirmed.length,
      confirmedAmount: sum(confirmed),
      confirmedNotPostedCount: unposted.length,
      confirmedNotPostedAmount: sum(unposted),
    },
  };
}

function csvCell(v: unknown): string {
  const s = v instanceof Date ? v.toISOString() : v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** GET /api/admin/payments/cod-reconciliation?from&to[&format=csv] */
export const getCodReconciliation = asyncHandler(async (req: Request, res: Response) => {
  const { from, to, format } = req.query as unknown as { from: Date; to: Date; format?: 'json' | 'csv' };
  if (to <= from) throw new ApiError(400, '"to" must be after "from"');
  const report = await codReconciliation(from, to);

  if (format === 'csv') {
    const header = ['paymentId', 'bookingId', 'region', 'amount', 'status', 'createdAt', 'capturedAt', 'confirmedBy', 'ledgerPosted'];
    const lines = [header.join(',')].concat(
      report.rows.map((r) => header.map((h) => csvCell(r[h as keyof CodRow])).join(','))
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cod-reconciliation-${from.toISOString().slice(0, 10)}-${to.toISOString().slice(0, 10)}.csv"`
    );
    res.status(200).send(lines.join('\n') + '\n');
    return;
  }
  res.status(200).json(report);
});
