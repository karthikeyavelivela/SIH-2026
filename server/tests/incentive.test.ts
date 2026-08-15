import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Incentive } from '../src/models/Incentive';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeCompletedBookingsForDriver(driverId: string, count: number) {
  const customer = await User.create({ name: 'C', phone: `999${Math.random().toString().slice(2, 9)}`, passwordHash: 'x', role: 'customer' });
  for (let i = 0; i < count; i++) {
    await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      assignedDriverIds: [driverId],
      status: 'completed',
      fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
      statusHistory: [{ status: 'completed', timestamp: new Date() }],
    });
  }
}

describe('incentive rules + run (admin)', () => {
  it('creates a rule and grants an Incentive to a qualifying driver on run', async () => {
    const { agent: adminAgent } = await loginAs('admin', '9940000001');
    const { user: driver } = await loginAs('driver', '9940000002');
    await User.updateOne({ _id: driver._id }, { ratingAvg: 4.8, ratingCount: 10 });
    await makeCompletedBookingsForDriver(driver._id.toString(), 5);

    const ruleRes = await adminAgent
      .post('/api/admin/incentives/rules')
      .send({ minRatingAvg: 4.5, minCompletedJobs: 3, bonusAmount: 500 });
    expect(ruleRes.status).toBe(201);

    const runRes = await adminAgent.post('/api/admin/incentives/run');
    expect(runRes.status).toBe(200);
    expect(runRes.body.totalGranted).toBe(1);

    const incentives = await Incentive.find({ targetUserId: driver._id });
    expect(incentives).toHaveLength(1);
    expect(incentives[0].bonusAmount).toBe(500);
  });

  it('does not grant twice for the same rule in the same period', async () => {
    const { agent: adminAgent } = await loginAs('admin', '9940000003');
    const { user: driver } = await loginAs('driver', '9940000004');
    await User.updateOne({ _id: driver._id }, { ratingAvg: 5, ratingCount: 10 });
    await makeCompletedBookingsForDriver(driver._id.toString(), 3);

    await adminAgent.post('/api/admin/incentives/rules').send({ minRatingAvg: 4.5, minCompletedJobs: 2, bonusAmount: 200 });
    const first = await adminAgent.post('/api/admin/incentives/run');
    expect(first.body.totalGranted).toBe(1);

    const second = await adminAgent.post('/api/admin/incentives/run');
    expect(second.body.totalGranted).toBe(0);
  });

  it('does not grant a driver below the rating threshold', async () => {
    const { agent: adminAgent } = await loginAs('admin', '9940000005');
    const { user: driver } = await loginAs('driver', '9940000006');
    await User.updateOne({ _id: driver._id }, { ratingAvg: 3.0, ratingCount: 10 });
    await makeCompletedBookingsForDriver(driver._id.toString(), 5);

    await adminAgent.post('/api/admin/incentives/rules').send({ minRatingAvg: 4.5, minCompletedJobs: 2, bonusAmount: 200 });
    const run = await adminAgent.post('/api/admin/incentives/run');
    expect(run.body.totalGranted).toBe(0);
  });

  it('is forbidden for a non-admin role', async () => {
    const { agent: managerAgent } = await loginAs('manager', '9940000007');
    const res = await managerAgent.post('/api/admin/incentives/rules').send({ minRatingAvg: 4, minCompletedJobs: 1, bonusAmount: 100 });
    expect(res.status).toBe(403);
  });

  it('deactivating a rule stops future runs from granting against it', async () => {
    const { agent: adminAgent } = await loginAs('admin', '9940000008');
    const { user: driver } = await loginAs('driver', '9940000009');
    await User.updateOne({ _id: driver._id }, { ratingAvg: 5, ratingCount: 10 });
    await makeCompletedBookingsForDriver(driver._id.toString(), 3);

    const ruleRes = await adminAgent.post('/api/admin/incentives/rules').send({ minRatingAvg: 4.5, minCompletedJobs: 2, bonusAmount: 200 });
    await adminAgent.patch(`/api/admin/incentives/rules/${ruleRes.body.rule._id}/deactivate`);

    const run = await adminAgent.post('/api/admin/incentives/run');
    expect(run.body.totalGranted).toBe(0);
  });
});
