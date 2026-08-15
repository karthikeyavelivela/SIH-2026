import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Complaint } from '../src/models/Complaint';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, permissions: string[] = []) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role, permissions });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeBooking(customerId: string, status: string, total = 100) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    status,
    fareBreakdown: { baseFare: total, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total },
    statusHistory: [{ status, timestamp: new Date() }],
  });
}

describe('GET /api/admin/stats', () => {
  it('reports active bookings, GMV, and open complaints correctly', async () => {
    const { agent, user: admin } = await loginAs('admin', '9960000001');
    const customer = await User.create({ name: 'C', phone: '9960009999', passwordHash: 'x', role: 'customer' });
    await makeBooking(customer._id.toString(), 'searching', 100);
    await makeBooking(customer._id.toString(), 'in_progress', 150);
    const completed = await makeBooking(customer._id.toString(), 'completed', 200);
    await Complaint.create({
      bookingId: completed._id,
      raisedByUserId: customer._id,
      category: 'other',
      description: 'x',
      status: 'open',
    });
    await Complaint.create({
      bookingId: completed._id,
      raisedByUserId: customer._id,
      category: 'other',
      description: 'x',
      status: 'resolved',
    });

    const res = await agent.get('/api/admin/stats');
    expect(res.status).toBe(200);
    expect(res.body.activeBookings).toBe(2);
    expect(res.body.gmv).toBe(200);
    expect(res.body.openComplaints).toBe(1);
    expect(res.body.totalCompletedBookings).toBe(1);
    void admin;
  });

  it('403s a manager without view_analytics', async () => {
    const { agent } = await loginAs('manager', '9960000002', ['resolve_complaints']);
    const res = await agent.get('/api/admin/stats');
    expect(res.status).toBe(403);
  });

  it('200s a manager with view_analytics', async () => {
    const { agent } = await loginAs('manager', '9960000003', ['view_analytics']);
    const res = await agent.get('/api/admin/stats');
    expect(res.status).toBe(200);
  });
});
