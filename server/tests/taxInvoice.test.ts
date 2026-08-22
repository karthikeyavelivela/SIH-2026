import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

async function loginAsCustomer(phone = '9920000001', businessProfile?: { isBusiness: boolean; gstin?: string; companyName?: string }) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'C', phone, passwordHash, role: 'customer', businessProfile });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: 'customer' });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeCompletedBooking(customerId: string, overrides: Partial<Record<string, unknown>> = {}) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    status: 'completed',
    fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
    ...overrides,
  });
}

async function payForBooking(agent: ReturnType<typeof request.agent>, bookingId: string) {
  await agent.post(`/api/payments/order/${bookingId}`);
  const capture = await agent.post(`/api/payments/${bookingId}/mock-capture`);
  return capture.body.payment;
}

describe('GET /api/bookings/:id/tax-invoice', () => {
  it('rejects generating an invoice before any payment exists', async () => {
    const { agent, user } = await loginAsCustomer();
    const booking = await makeCompletedBooking(user._id.toString());

    const res = await agent.get(`/api/bookings/${booking._id}/tax-invoice`);
    expect(res.status).toBe(400);
  });

  it('generates a real PDF once the booking is genuinely paid, and the total matches the actual payment amount', async () => {
    const { agent, user } = await loginAsCustomer('9920000002');
    const booking = await makeCompletedBooking(user._id.toString(), {
      fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 100, total: 350 },
    });
    const payment = await payForBooking(agent, booking._id.toString());
    expect(payment.amount).toBe(350);

    const res = await agent.get(`/api/bookings/${booking._id}/tax-invoice`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    // A real PDF starts with the %PDF- magic bytes — proves pdfkit actually
    // rendered a document, not just returned a 200 with empty/garbage body.
    expect(Buffer.from(res.body).subarray(0, 5).toString()).toBe('%PDF-');
    expect(Buffer.from(res.body).length).toBeGreaterThan(500);
  });

  it("404s for a booking that belongs to a different customer (IDOR guard)", async () => {
    const { agent: ownerAgent, user: owner } = await loginAsCustomer('9920000003');
    const booking = await makeCompletedBooking(owner._id.toString());
    await payForBooking(ownerAgent, booking._id.toString());

    const { agent: strangerAgent } = await loginAsCustomer('9920000004');
    const res = await strangerAgent.get(`/api/bookings/${booking._id}/tax-invoice`);
    expect(res.status).toBe(404);
  });

  it('works for a business customer with a GSTIN on file (still succeeds — GSTIN presence only changes what prints, never blocks generation)', async () => {
    const { agent, user } = await loginAsCustomer('9920000005', {
      isBusiness: true,
      gstin: '37AAAAA0000A1Z5',
      companyName: 'Test Traders Pvt Ltd',
    });
    const booking = await makeCompletedBooking(user._id.toString());
    await payForBooking(agent, booking._id.toString());

    const res = await agent.get(`/api/bookings/${booking._id}/tax-invoice`);
    expect(res.status).toBe(200);
  });
});
