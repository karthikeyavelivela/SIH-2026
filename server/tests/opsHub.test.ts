import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Dispute } from '../src/models/Dispute';
import { Payout } from '../src/models/Payout';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, permissions: string[] = []) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role, permissions });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

describe('GET /api/admin/ops-hub', () => {
  it('a manager without view_analytics is blocked', async () => {
    const { agent } = await loginAs('manager', '9991000001', []);
    const res = await agent.get('/api/admin/ops-hub');
    expect(res.status).toBe(403);
  });

  it('flags a real accepted booking as a late pickup once past the threshold, and counts open disputes/pending payouts', async () => {
    const customer = await User.create({ name: 'C', phone: '9991000002', passwordHash: 'x', role: 'customer' });
    const staleAcceptedAt = new Date(Date.now() - 30 * 60_000); // 30 min ago, past the 20-min threshold
    await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Late Pickup Addr' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      status: 'accepted',
      fareBreakdown: { baseFare: 200, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: 200 },
      statusHistory: [
        { status: 'searching', timestamp: new Date(Date.now() - 40 * 60_000) },
        { status: 'accepted', timestamp: staleAcceptedAt },
      ],
    });

    await Dispute.create({
      raisedBy: customer._id,
      bookingId: '507f1f77bcf86cd799439011',
      claim: 'Driver never showed up',
      status: 'open',
      priority: 'high',
      systemRecord: {
        status: 'completed',
        fareTotal: 200,
        distanceKm: 5,
        pickupAddress: 'Pickup',
        dropAddress: 'Drop',
      },
    });
    await Payout.create({ userId: customer._id, amount: 300, source: 'earnings', status: 'pending', period: '2026-08' });

    const { agent } = await loginAs('manager', '9991000003', ['view_analytics']);
    const res = await agent.get('/api/admin/ops-hub');
    expect(res.status).toBe(200);
    expect(res.body.counts.latePickups).toBe(1);
    expect(res.body.latePickups[0].pickupAddress).toBe('Late Pickup Addr');
    expect(res.body.counts.openDisputes).toBe(1);
    expect(res.body.counts.pendingPayouts).toBe(1);
    expect(res.body.actionQueue.length).toBeGreaterThan(0);
  });

  it('an accepted booking still within the threshold is not flagged as late', async () => {
    const customer = await User.create({ name: 'C2', phone: '9991000004', passwordHash: 'x', role: 'customer' });
    await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Fresh Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      status: 'accepted',
      fareBreakdown: { baseFare: 200, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: 200 },
      statusHistory: [{ status: 'accepted', timestamp: new Date() }],
    });

    const { agent } = await loginAs('admin', '9991000005');
    const res = await agent.get('/api/admin/ops-hub');
    expect(res.status).toBe(200);
    expect(res.body.counts.latePickups).toBe(0);
  });
});
