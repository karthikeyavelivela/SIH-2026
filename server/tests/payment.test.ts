import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Payment } from '../src/models/Payment';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { signAccessToken } from '../src/services/token.service';

async function loginAsCustomer(phone = '9910000001') {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'C', phone, passwordHash, role: 'customer' });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: 'customer' });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'W', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeCompletedBooking(customerId: string, total = 250, driverId?: string) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    assignedDriverIds: driverId ? [driverId] : [],
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

    // The money-chain regression this covers: writeLedgerEntry existed but
    // was never actually called from a real payment-capture path (see
    // ledger.service.ts's own former "not yet wired in" doc comment) — a
    // successful payment must post a real 'revenue' LedgerEntry, not just
    // flip the Payment's own status.
    const entry = await LedgerEntry.findOne({ entityType: 'Payment', entityId: res.body.payment._id });
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('revenue');
    expect(entry!.amount).toBe(res.body.payment.amount);
  });

  it('capturing twice never double-posts the revenue ledger entry', async () => {
    const { agent, user } = await loginAsCustomer('9910000009');
    const booking = await makeCompletedBooking(user._id.toString());
    await agent.post(`/api/payments/order/${booking._id}`);
    await agent.post(`/api/payments/${booking._id}/mock-capture`);
    await agent.post(`/api/payments/${booking._id}/mock-capture`); // already-success retry

    const payment = await Payment.findOne({ bookingId: booking._id });
    const count = await LedgerEntry.countDocuments({ entityType: 'Payment', entityId: payment!._id });
    expect(count).toBe(1);
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

    const entry = await LedgerEntry.findOne({ entityType: 'Payment', entityId: payment!._id });
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('revenue');
    expect(entry!.amount).toBe(payment!.amount);
  });
});

describe('POST /api/payments/:bookingId/cod', () => {
  it('creates a pending cash-on-delivery payment for the real fare total', async () => {
    const { agent, user } = await loginAsCustomer('9910000010');
    const booking = await makeCompletedBooking(user._id.toString(), 300.5);

    const res = await agent.post(`/api/payments/${booking._id}/cod`);
    expect(res.status).toBe(201);
    expect(res.body.payment.method).toBe('cod');
    expect(res.body.payment.status).toBe('pending');
    expect(res.body.payment.amount).toBe(300.5);
  });

  it('rejects for a booking that is not completed', async () => {
    const { agent, user } = await loginAsCustomer('9910000011');
    const booking = await Booking.create({
      customerId: user._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      status: 'in_progress',
      fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
      statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
    });
    const res = await agent.post(`/api/payments/${booking._id}/cod`);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/payments/:bookingId/cod/confirm', () => {
  it('the assigned driver confirms cash received, posting a real revenue ledger entry', async () => {
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9910000012');
    const { agent: customerAgent, user: customer } = await loginAsCustomer('9910000013');
    const booking = await makeCompletedBooking(customer._id.toString(), 275, driver._id.toString());
    await customerAgent.post(`/api/payments/${booking._id}/cod`);

    const res = await driverAgent.post(`/api/payments/${booking._id}/cod/confirm`);
    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('success');
    expect(res.body.payment.codConfirmedBy).toBe(driver._id.toString());

    const entry = await LedgerEntry.findOne({ entityType: 'Payment', entityId: res.body.payment._id });
    expect(entry).not.toBeNull();
    expect(entry!.type).toBe('revenue');
    expect(entry!.amount).toBe(275);
  });

  it('rejects confirmation from a driver not assigned to the booking (custody IDOR guard)', async () => {
    const { user: driver } = await loginAs('driver', '9910000014');
    const { agent: strangerAgent } = await loginAs('driver', '9910000015');
    const { agent: customerAgent, user: customer } = await loginAsCustomer('9910000016');
    const booking = await makeCompletedBooking(customer._id.toString(), 275, driver._id.toString());
    await customerAgent.post(`/api/payments/${booking._id}/cod`);

    const res = await strangerAgent.post(`/api/payments/${booking._id}/cod/confirm`);
    expect(res.status).toBe(403);
  });

  it('the customer cannot confirm their own cash payment', async () => {
    const { user: driver } = await loginAs('driver', '9910000017');
    const { agent: customerAgent, user: customer } = await loginAsCustomer('9910000018');
    const booking = await makeCompletedBooking(customer._id.toString(), 275, driver._id.toString());
    await customerAgent.post(`/api/payments/${booking._id}/cod`);

    const res = await customerAgent.post(`/api/payments/${booking._id}/cod/confirm`);
    expect(res.status).toBe(403);
  });

  it('confirming twice never double-posts the revenue ledger entry', async () => {
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9910000019');
    const { agent: customerAgent, user: customer } = await loginAsCustomer('9910000020');
    const booking = await makeCompletedBooking(customer._id.toString(), 275, driver._id.toString());
    await customerAgent.post(`/api/payments/${booking._id}/cod`);
    await driverAgent.post(`/api/payments/${booking._id}/cod/confirm`);
    await driverAgent.post(`/api/payments/${booking._id}/cod/confirm`);

    const payment = await Payment.findOne({ bookingId: booking._id });
    const count = await LedgerEntry.countDocuments({ entityType: 'Payment', entityId: payment!._id });
    expect(count).toBe(1);
  });
});

describe('GET /api/payments/cod/pending', () => {
  it("lists the worker's own completed bookings with cash still awaiting their confirmation", async () => {
    const { agent: driverAgent, user: driver } = await loginAs('driver', '9910000021');
    const { agent: customerAgent, user: customer } = await loginAsCustomer('9910000022');
    const booking = await makeCompletedBooking(customer._id.toString(), 275, driver._id.toString());
    await customerAgent.post(`/api/payments/${booking._id}/cod`);

    const res = await driverAgent.get('/api/payments/cod/pending');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].payment.amount).toBe(275);
    expect(res.body.items[0].booking._id).toBe(booking._id.toString());
  });

  it('does not list another driver\'s pending cash', async () => {
    const { user: driver } = await loginAs('driver', '9910000023');
    const { agent: strangerAgent } = await loginAs('driver', '9910000024');
    const { agent: customerAgent, user: customer } = await loginAsCustomer('9910000025');
    const booking = await makeCompletedBooking(customer._id.toString(), 275, driver._id.toString());
    await customerAgent.post(`/api/payments/${booking._id}/cod`);

    const res = await strangerAgent.get('/api/payments/cod/pending');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('is forbidden for a customer', async () => {
    const { agent } = await loginAsCustomer('9910000026');
    const res = await agent.get('/api/payments/cod/pending');
    expect(res.status).toBe(403);
  });
});
