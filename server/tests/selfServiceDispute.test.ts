import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function makeBookingFor(customerId: string) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 100 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'A' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'B' },
    requiredVehicles: [{ capacityKg: 100, count: 1 }],
    status: 'completed',
    fareBreakdown: { baseFare: 200, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: 200 },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

describe('POST /api/disputes (Phase 4 — self-service, off the existing admin-only flow)', () => {
  it('a customer can raise a dispute on their own booking', async () => {
    const { agent, user } = await loginAs('customer', '9890000001');
    const booking = await makeBookingFor(user._id.toString());

    const res = await agent.post('/api/disputes').send({ bookingId: booking._id, claim: 'Fare was wrong.' });
    expect(res.status).toBe(201);
    expect(res.body.dispute.raisedBy).toBe(user._id.toString());
    expect(res.body.dispute.systemRecord.fareTotal).toBe(200);
  });

  it('cannot raise a dispute using someone else\'s raisedBy — it is always derived from the session, never the body', async () => {
    const { user: victim } = await loginAs('customer', '9890000002');
    const booking = await makeBookingFor(victim._id.toString());

    const { agent: attackerAgent } = await loginAs('customer', '9890000003');
    // Attacker has no relationship to this booking at all.
    const res = await attackerAgent.post('/api/disputes').send({ bookingId: booking._id, claim: 'Not mine, trying anyway' });
    expect(res.status).toBe(404);
  });

  it('GET /api/disputes/mine only returns the caller\'s own disputes', async () => {
    const { agent: agentA, user: userA } = await loginAs('customer', '9890000004');
    const bookingA = await makeBookingFor(userA._id.toString());
    await agentA.post('/api/disputes').send({ bookingId: bookingA._id, claim: 'A\'s claim' });

    const { agent: agentB, user: userB } = await loginAs('customer', '9890000005');
    const bookingB = await makeBookingFor(userB._id.toString());
    await agentB.post('/api/disputes').send({ bookingId: bookingB._id, claim: 'B\'s claim' });

    const listA = await agentA.get('/api/disputes/mine');
    expect(listA.body.disputes).toHaveLength(1);
    expect(listA.body.disputes[0].claim).toBe("A's claim");
  });

  it('blocks admin from this self-service router (it is worker/customer-only)', async () => {
    const { agent } = await loginAs('admin', '9890000006');
    const res = await agent.get('/api/disputes/mine');
    expect(res.status).toBe(403);
  });
});
