import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Payment } from '../src/models/Payment';
import { signAccessToken } from '../src/services/token.service';

async function loginAsCustomer(phone = '9910000001') {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'C', phone, passwordHash, role: 'customer' });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: 'customer' });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeCompletedBooking(customerId: string, total = 250) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    status: 'completed',
    fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

describe('POST /api/payments/order/:bookingId', () => {
  it("creates a pending payment using the booking's own server-stored total, not a client-supplied amount", async () => {
    const { agent, user } = await loginAsCustomer();
    const booking = await makeCompletedBooking(user._id.toString(), 255.7);

    const res = await agent.post(`/api/payments/order/${booking._id}`).send({ amount: 1 }); // attempted override, must be ignored
    expect(res.status).toBe(201);
    expect(res.body.payment.amount).toBe(255.7);
    expect(res.body.payment.status).toBe('pending');
    expect(res.body.order.amount).toBe(25570); // paise
  });

  it('rejects creating a payment for a booking that is not completed', async () => {
    const { agent, user } = await loginAsCustomer('9910000002');
    const booking = await Booking.create({
      customerId: user._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      status: 'searching',
      fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
      statusHistory: [{ status: 'searching', timestamp: new Date() }],
    });
    const res = await agent.post(`/api/payments/order/${booking._id}`);
    expect(res.status).toBe(400);
  });

  it("404s for a booking that belongs to a different customer (IDOR guard)", async () => {
    const { user: owner } = await loginAsCustomer('9910000003');
    const booking = await makeCompletedBooking(owner._id.toString());
    const { agent: strangerAgent } = await loginAsCustomer('9910000004');

    const res = await strangerAgent.post(`/api/payments/order/${booking._id}`);
    expect(res.status).toBe(404);
  });
});

describe('POST /api/payments/:bookingId/mock-capture', () => {
  it('marks a pending payment as success (mock mode)', async () => {
    const { agent, user } = await loginAsCustomer('9910000005');
    const booking = await makeCompletedBooking(user._id.toString());
    await agent.post(`/api/payments/order/${booking._id}`);

    const res = await agent.post(`/api/payments/${booking._id}/mock-capture`);
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('success');
    expect(res.body.payment.razorpayPaymentId).toBeTruthy();
  });

  it('404s if no payment order exists yet', async () => {
    const { agent, user } = await loginAsCustomer('9910000006');
    const booking = await makeCompletedBooking(user._id.toString());
    const res = await agent.post(`/api/payments/${booking._id}/mock-capture`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/payments/:bookingId', () => {
  it("returns the caller's own payment status", async () => {
    const { agent, user } = await loginAsCustomer('9910000007');
    const booking = await makeCompletedBooking(user._id.toString());
    await agent.post(`/api/payments/order/${booking._id}`);

    const res = await agent.get(`/api/payments/${booking._id}`);
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('pending');
  });
});

describe('POST /api/payments/webhook', () => {
  it('is unreachable meaningfully without a matching order — acknowledges (200) but does not create/alter a Payment', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', 'anything') // mock mode: signature check always passes
      .send({ event: 'payment.captured', payload: { payment: { entity: { order_id: 'order_nonexistent', id: 'pay_x' } } } });
    expect(res.status).toBe(200);
  });

  it('updates the matching Payment to success on a payment.captured event', async () => {
    const { agent, user } = await loginAsCustomer('9910000008');
    const booking = await makeCompletedBooking(user._id.toString());
    const orderRes = await agent.post(`/api/payments/order/${booking._id}`);
    const orderId = orderRes.body.order.id;

    const res = await request(app)
      .post('/api/payments/webhook')
      .set('x-razorpay-signature', 'anything')
      .send({
        event: 'payment.captured',
        payload: { payment: { entity: { order_id: orderId, id: 'pay_webhook_test' } } },
      });
    expect(res.status).toBe(200);

    const payment = await Payment.findOne({ razorpayOrderId: orderId });
    expect(payment?.status).toBe('success');
    expect(payment?.razorpayPaymentId).toBe('pay_webhook_test');
  });
});
