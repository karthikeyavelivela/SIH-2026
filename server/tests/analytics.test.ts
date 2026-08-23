import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Vehicle } from '../src/models/Vehicle';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, permissions: string[] = []) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role, permissions });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function makeCompletedBooking(customerId: string, total: number, lat = 17.385, lng = 78.4867) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [lng, lat], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    status: 'completed',
    fareBreakdown: { baseFare: total, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total },
    statusHistory: [
      { status: 'searching', timestamp: new Date(Date.now() - 30 * 60_000) },
      { status: 'completed', timestamp: new Date() },
    ],
  });
}

describe('GET /api/admin/analytics/overview', () => {
  it('a manager without view_analytics is blocked', async () => {
    const { agent } = await loginAs('manager', '9996000001', []);
    const res = await agent.get('/api/admin/analytics/overview');
    expect(res.status).toBe(403);
  });

  it('zeros/empty arrays on a sparse DB, never fabricated placeholder numbers', async () => {
    const { agent } = await loginAs('admin', '9996000002');
    const res = await agent.get('/api/admin/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.kpis.revenue).toBe(0);
    expect(res.body.kpis.completedTrips).toBe(0);
    expect(res.body.heatmap).toEqual([]);
    expect(res.body.revenueTrend).toEqual([]);
  });

  it('revenue KPI is a real sum of completed bookings only (not searching/cancelled)', async () => {
    const customer = await User.create({ name: 'C', phone: '9996000003', passwordHash: 'x', role: 'customer' });
    await makeCompletedBooking(customer._id.toString(), 500);
    await makeCompletedBooking(customer._id.toString(), 250);
    await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      status: 'searching', // not completed — must NOT count toward revenue
      fareBreakdown: { baseFare: 999, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: 999 },
      statusHistory: [{ status: 'searching', timestamp: new Date() }],
    });

    const { agent } = await loginAs('admin', '9996000004');
    const res = await agent.get('/api/admin/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.kpis.revenue).toBe(750);
    expect(res.body.kpis.completedTrips).toBe(2);
  });

  it('fleet utilization is a real ratio of on_job vehicles to total vehicles', async () => {
    const owner = await User.create({ name: 'Owner', phone: '9996000005', passwordHash: 'x', role: 'driver' });
    await Vehicle.create({ ownerId: owner._id, type: 'mini_truck', capacityKg: 1000, registrationNumber: 'AP01AA0001', availabilityStatus: 'on_job' });
    await Vehicle.create({ ownerId: owner._id, type: 'mini_truck', capacityKg: 1000, registrationNumber: 'AP01AA0002', availabilityStatus: 'online' });
    await Vehicle.create({ ownerId: owner._id, type: 'mini_truck', capacityKg: 1000, registrationNumber: 'AP01AA0003', availabilityStatus: 'offline' });
    await Vehicle.create({ ownerId: owner._id, type: 'mini_truck', capacityKg: 1000, registrationNumber: 'AP01AA0004', availabilityStatus: 'offline' });

    const { agent } = await loginAs('admin', '9996000006');
    const res = await agent.get('/api/admin/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.kpis.fleetUtilization).toBe(25); // 1 of 4 vehicles on_job
  });

  it('a manager WITH view_analytics can access the same overview as admin', async () => {
    const { agent } = await loginAs('manager', '9996000007', ['view_analytics']);
    const res = await agent.get('/api/admin/analytics/overview');
    expect(res.status).toBe(200);
  });
});
