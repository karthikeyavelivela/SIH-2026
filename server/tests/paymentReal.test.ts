import './setup';
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { app } from '../src/app';
import { env, paymentConfigProblems } from '../src/config/env';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Payment } from '../src/models/Payment';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { signAccessToken } from '../src/services/token.service';
import { safeHexEqual, verifyCheckoutSignature, verifyWebhookSignature } from '../src/services/payment.service';
import { buildPaymentRouter } from '../src/routes/payment.routes';

/*
 * P0.1 — real (test-mode) Razorpay. Keys below are throwaway strings for
 * these tests only; nothing here talks to Razorpay.
 */

const KEY_SECRET = 'test_key_secret_for_unit_tests';
const WEBHOOK_SECRET = 'test_webhook_secret_for_unit_tests';

const saved = {
  MOCK_PAYMENTS: env.MOCK_PAYMENTS,
  RAZORPAY_KEY_SECRET: env.RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET: env.RAZORPAY_WEBHOOK_SECRET,
};
afterEach(() => {
  Object.assign(env, saved);
});

let seq = 0;
async function as(role: string) {
  seq += 1;
  const user = await User.create({ name: 'U', phone: `97100${String(seq).padStart(5, '0')}`, passwordHash: 'x', role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function completedBooking(customerId: string, total = 250, hamaliId?: string) {
  return Booking.create({
    customerId,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredHamaliCount: 1,
    assignedHamaliIds: hamaliId ? [hamaliId] : [],
    status: 'completed',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: total, total },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

const sign = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(data).digest('hex');

async function revenueCount(paymentId: unknown) {
  return LedgerEntry.countDocuments({ type: 'revenue', entityType: 'Payment', entityId: paymentId });
}

describe('boot guard', () => {
  const base = { NODE_ENV: 'production' as const, MOCK_PAYMENTS: false, RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'k', RAZORPAY_WEBHOOK_SECRET: 'w' };

  it('refuses production with real payments and no webhook secret', () => {
    const problems = paymentConfigProblems({ ...base, RAZORPAY_WEBHOOK_SECRET: undefined });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/RAZORPAY_WEBHOOK_SECRET/);
  });

  it('refuses production with real payments and no key pair', () => {
    expect(paymentConfigProblems({ ...base, RAZORPAY_KEY_ID: undefined, RAZORPAY_KEY_SECRET: undefined })[0]).toMatch(
      /RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET/
    );
  });

  it('allows a complete production config, mock payments, and any non-production env', () => {
    expect(paymentConfigProblems(base)).toEqual([]);
    expect(paymentConfigProblems({ ...base, MOCK_PAYMENTS: true, RAZORPAY_WEBHOOK_SECRET: undefined })).toEqual([]);
    expect(paymentConfigProblems({ ...base, NODE_ENV: 'development', RAZORPAY_WEBHOOK_SECRET: undefined })).toEqual([]);
  });

  it('actually throws when the env module loads in that state', () => {
    const before = { ...process.env };
    try {
      Object.assign(process.env, { NODE_ENV: 'production', MOCK_PAYMENTS: 'false', RAZORPAY_KEY_ID: 'rzp_test_x', RAZORPAY_KEY_SECRET: 'k' });
      delete process.env.RAZORPAY_WEBHOOK_SECRET;
      expect(() => jest.isolateModules(() => require('../src/config/env'))).toThrow(/RAZORPAY_WEBHOOK_SECRET/);
    } finally {
      process.env = before;
    }
  });
});

describe('signature helpers', () => {
  it('compares digests of different length without throwing', () => {
    expect(safeHexEqual('abcd', 'abc')).toBe(false);
    expect(safeHexEqual('abcd', 'abcd')).toBe(true);
  });

  it('verifies a Checkout signature over order|payment with the key secret', () => {
    env.RAZORPAY_KEY_SECRET = KEY_SECRET;
    const good = sign(KEY_SECRET, 'order_1|pay_1');
    expect(verifyCheckoutSignature('order_1', 'pay_1', good)).toBe(true);
    expect(verifyCheckoutSignature('order_1', 'pay_2', good)).toBe(false);
    expect(verifyCheckoutSignature('order_1', 'pay_1', good.slice(0, 10))).toBe(false);
  });

  it('never accepts a webhook when real payments have no secret', () => {
    env.MOCK_PAYMENTS = false;
    env.RAZORPAY_WEBHOOK_SECRET = undefined;
    expect(verifyWebhookSignature('{}', 'anything')).toBe(false);
  });

  it('always checks a configured webhook secret, even in mock mode', () => {
    env.MOCK_PAYMENTS = true;
    env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    expect(verifyWebhookSignature('{"a":1}', 'bad')).toBe(false);
    expect(verifyWebhookSignature('{"a":1}', sign(WEBHOOK_SECRET, '{"a":1}'))).toBe(true);
  });
});

describe('POST /api/payments/:bookingId/verify', () => {
  async function pendingPayment() {
    const { agent, user } = await as('customer');
    const booking = await completedBooking(user._id.toString(), 480);
    const payment = await Payment.create({ bookingId: booking._id, amount: 480, status: 'pending', razorpayOrderId: `order_${seq}` });
    return { agent, booking, payment };
  }

  beforeEach(() => {
    env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  });

  it('captures a correctly signed payment exactly once and posts revenue once', async () => {
    const { agent, booking, payment } = await pendingPayment();
    const body = {
      razorpay_order_id: payment.razorpayOrderId,
      razorpay_payment_id: 'pay_abc',
      razorpay_signature: sign(KEY_SECRET, `${payment.razorpayOrderId}|pay_abc`),
    };

    const first = await agent.post(`/api/payments/${booking._id}/verify`).send(body);
    expect(first.status).toBe(200);
    expect(first.body.payment.status).toBe('success');
    expect(first.body.payment.capturedAt).toBeTruthy();

    const again = await agent.post(`/api/payments/${booking._id}/verify`).send(body);
    expect(again.status).toBe(200);
    expect(await revenueCount(payment._id)).toBe(1);
  });

  it('rejects a wrong signature with 400 and changes nothing', async () => {
    const { agent, booking, payment } = await pendingPayment();
    const res = await agent.post(`/api/payments/${booking._id}/verify`).send({
      razorpay_order_id: payment.razorpayOrderId,
      razorpay_payment_id: 'pay_abc',
      razorpay_signature: sign('someone-elses-secret', `${payment.razorpayOrderId}|pay_abc`),
    });
    expect(res.status).toBe(400);
    expect((await Payment.findById(payment._id))!.status).toBe('pending');
    expect(await revenueCount(payment._id)).toBe(0);
  });

  it('answers a signature of the wrong length with 400, not a 500', async () => {
    const { agent, booking, payment } = await pendingPayment();
    const res = await agent
      .post(`/api/payments/${booking._id}/verify`)
      .send({ razorpay_order_id: payment.razorpayOrderId, razorpay_payment_id: 'pay_abc', razorpay_signature: 'short' });
    expect(res.status).toBe(400);
  });

  it('refuses an order id that belongs to a different booking', async () => {
    const { agent, booking } = await pendingPayment();
    const other = await pendingPayment();
    const res = await agent.post(`/api/payments/${booking._id}/verify`).send({
      razorpay_order_id: other.payment.razorpayOrderId,
      razorpay_payment_id: 'pay_abc',
      razorpay_signature: sign(KEY_SECRET, `${other.payment.razorpayOrderId}|pay_abc`),
    });
    expect(res.status).toBe(400);
  });

  it('validates the body', async () => {
    const { agent, booking } = await pendingPayment();
    const res = await agent.post(`/api/payments/${booking._id}/verify`).send({ razorpay_order_id: '' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/webhook', () => {
  beforeEach(() => {
    env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
    env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  });

  async function pending() {
    const { user } = await as('customer');
    const booking = await completedBooking(user._id.toString(), 300);
    return Payment.create({ bookingId: booking._id, amount: 300, status: 'pending', razorpayOrderId: `order_w${seq}` });
  }

  function event(orderId: string, name = 'payment.captured') {
    return JSON.stringify({ event: name, payload: { payment: { entity: { id: 'pay_w1', order_id: orderId } } } });
  }

  it('400s with no signature, a wrong one, or one of the wrong length — and changes nothing', async () => {
    const payment = await pending();
    const body = event(payment.razorpayOrderId!);
    const post = (sig?: string) => {
      const r = request(app).post('/api/payments/webhook').set('Content-Type', 'application/json');
      return (sig ? r.set('X-Razorpay-Signature', sig) : r).send(body);
    };
    expect((await post()).status).toBe(400);
    expect((await post(sign('wrong', body))).status).toBe(400);
    expect((await post('abc')).status).toBe(400);
    expect((await Payment.findById(payment._id))!.status).toBe('pending');
    expect(await revenueCount(payment._id)).toBe(0);
  });

  it('captures on a valid delivery and stays idempotent on redelivery', async () => {
    const payment = await pending();
    const body = event(payment.razorpayOrderId!);
    const send = () =>
      request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', sign(WEBHOOK_SECRET, body))
        .send(body);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect((await Payment.findById(payment._id))!.status).toBe('success');
    expect(await revenueCount(payment._id)).toBe(1);
  });

  it('posts revenue once when the browser verify and the webhook race', async () => {
    const { agent, user } = await as('customer');
    const booking = await completedBooking(user._id.toString(), 300);
    const payment = await Payment.create({ bookingId: booking._id, amount: 300, status: 'pending', razorpayOrderId: 'order_race' });
    const body = event('order_race');
    await Promise.all([
      request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', sign(WEBHOOK_SECRET, body))
        .send(body),
      agent.post(`/api/payments/${booking._id}/verify`).send({
        razorpay_order_id: 'order_race',
        razorpay_payment_id: 'pay_w1',
        razorpay_signature: sign(KEY_SECRET, 'order_race|pay_w1'),
      }),
    ]);
    expect(await revenueCount(payment._id)).toBe(1);
  });

  it('marks a failed payment failed, and never downgrades a captured one', async () => {
    const payment = await pending();
    const failed = event(payment.razorpayOrderId!, 'payment.failed');
    await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sign(WEBHOOK_SECRET, failed))
      .send(failed);
    expect((await Payment.findById(payment._id))!.status).toBe('failed');

    const captured = event(payment.razorpayOrderId!);
    await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sign(WEBHOOK_SECRET, captured))
      .send(captured);
    await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', sign(WEBHOOK_SECRET, failed))
      .send(failed);
    expect((await Payment.findById(payment._id))!.status).toBe('success');
  });
});

describe('mock capture route', () => {
  function miniApp(mockPayments: boolean) {
    const a = express();
    a.use(express.json());
    a.use(cookieParser());
    a.use('/api/payments', buildPaymentRouter({ mockPayments }));
    return a;
  }

  it('does not exist when payments are real', async () => {
    const { user } = await as('customer');
    const booking = await completedBooking(user._id.toString());
    await Payment.create({ bookingId: booking._id, amount: 250, status: 'pending', razorpayOrderId: 'order_m' });
    const cookie = `accessToken=${signAccessToken({ id: user._id.toString(), role: 'customer' })}`;

    const real = await request(miniApp(false)).post(`/api/payments/${booking._id}/mock-capture`).set('Cookie', cookie);
    expect(real.status).toBe(404);
    expect(real.body).toEqual({}); // Express's own 404: no handler matched at all

    env.MOCK_PAYMENTS = true;
    const mock = await request(miniApp(true)).post(`/api/payments/${booking._id}/mock-capture`).set('Cookie', cookie);
    expect(mock.status).toBe(200);
  });
});

describe('GET /api/admin/payments/cod-reconciliation', () => {
  it('totals pending, confirmed and confirmed-but-unposted cash, and exports CSV', async () => {
    const { agent: admin } = await as('admin');
    const { agent: worker, user: w } = await as('hamali_solo');

    const { agent: c1, user: u1 } = await as('customer');
    const b1 = await completedBooking(u1._id.toString(), 100, w._id.toString());
    await c1.post(`/api/payments/${b1._id}/cod`);
    await worker.post(`/api/payments/${b1._id}/cod/confirm`); // confirmed + posted

    const { agent: c2, user: u2 } = await as('customer');
    const b2 = await completedBooking(u2._id.toString(), 40.5, w._id.toString());
    await c2.post(`/api/payments/${b2._id}/cod`); // still with the worker

    const { user: u3 } = await as('customer');
    const b3 = await completedBooking(u3._id.toString(), 60, w._id.toString());
    // Marked paid without going through capture — no ledger posting. The
    // report must surface exactly this.
    await Payment.create({ bookingId: b3._id, amount: 60, method: 'cod', status: 'success' });

    const from = new Date(Date.now() - 3600_000).toISOString();
    const to = new Date(Date.now() + 3600_000).toISOString();
    const res = await admin.get(`/api/admin/payments/cod-reconciliation?from=${from}&to=${to}`);
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({
      count: 3,
      pendingCount: 1,
      pendingAmount: 40.5,
      confirmedCount: 2,
      confirmedAmount: 160,
      confirmedNotPostedCount: 1,
      confirmedNotPostedAmount: 60,
    });

    const csv = await admin.get(`/api/admin/payments/cod-reconciliation?from=${from}&to=${to}&format=csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.trim().split('\n');
    expect(lines[0]).toBe('paymentId,bookingId,region,amount,status,createdAt,capturedAt,confirmedBy,ledgerPosted');
    expect(lines).toHaveLength(4);
  });

  it('is admin-only and validates the range', async () => {
    const { agent: customer } = await as('customer');
    const from = new Date().toISOString();
    expect((await customer.get(`/api/admin/payments/cod-reconciliation?from=${from}&to=${from}`)).status).toBe(403);
    const { agent: admin } = await as('admin');
    expect((await admin.get(`/api/admin/payments/cod-reconciliation?from=${from}&to=${from}`)).status).toBe(400);
    expect((await admin.get('/api/admin/payments/cod-reconciliation?from=nope&to=nope')).status).toBe(400);
  });
});
