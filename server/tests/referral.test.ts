import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Referral } from '../src/models/Referral';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

describe('referral self-service (driver/hamali_solo/fleet_owner)', () => {
  it('returns a deterministic code, and re-requesting it is idempotent', async () => {
    const { agent } = await loginAs('driver', '9980000001');
    const first = await agent.post('/api/referrals/code');
    const second = await agent.post('/api/referrals/code');
    expect(first.body.code).toBe(second.body.code);
    expect(first.body.code).toMatch(/^FYRO/);
  });

  it('inviting the same phone twice does not create a duplicate row', async () => {
    const { agent } = await loginAs('driver', '9980000002');
    const first = await agent.post('/api/referrals/invite').send({ phone: '9111111111' });
    expect(first.status).toBe(200);
    const second = await agent.post('/api/referrals/invite').send({ phone: '9111111111' });
    expect(second.status).toBe(200);
    expect(second.body.referral._id).toBe(first.body.referral._id);

    const count = await Referral.countDocuments({ referrerId: (await User.findOne({ phone: '9980000002' }))!._id });
    expect(count).toBe(1);
  });

  it('promotes invited -> signed_up once a matching account signs up, visible on GET /me', async () => {
    const { agent, user } = await loginAs('driver', '9980000003');
    await agent.post('/api/referrals/invite').send({ phone: '9222222222' });

    // The referred phone number signs up for real.
    await User.create({ name: 'New Driver', phone: '9222222222', passwordHash: 'x', role: 'driver' });

    const res = await agent.get('/api/referrals/me');
    expect(res.status).toBe(200);
    const row = res.body.stats.referrals.find((r: { referredPhone: string }) => r.referredPhone === '9222222222');
    expect(row.status).toBe('signed_up');
    void user;
  });

  it('blocks a customer from the referral endpoints entirely', async () => {
    const { agent } = await loginAs('customer', '9980000004');
    const res = await agent.get('/api/referrals/me');
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/referrals/check-payouts', () => {
  it('marks bonus_paid once the referred user has a real completed booking, admin-only', async () => {
    const { agent: driverAgent, user: referrer } = await loginAs('driver', '9980000005');
    await driverAgent.post('/api/referrals/invite').send({ phone: '9333333333' });
    const referred = await User.create({ name: 'Referred', phone: '9333333333', passwordHash: 'x', role: 'driver' });
    await driverAgent.get('/api/referrals/me'); // triggers invited -> signed_up promotion

    const customer = await User.create({ name: 'Cust', phone: '9980000006', passwordHash: 'x', role: 'customer' });
    await Booking.create({
      customerId: customer._id,
      type: 'truck',
      cargoDetails: { weightKg: 500 },
      pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
      dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
      requiredVehicles: [{ capacityKg: 500, count: 1 }],
      assignedDriverIds: [referred._id],
      status: 'completed',
      fareBreakdown: { baseFare: 200, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: 200 },
      statusHistory: [{ status: 'completed', timestamp: new Date() }],
    });

    const { agent: adminAgent } = await loginAs('admin', '9980000007');
    const res = await adminAgent.post('/api/admin/referrals/check-payouts');
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(1);

    const referral = await Referral.findOne({ referrerId: referrer._id, referredPhone: '9333333333' });
    expect(referral!.status).toBe('bonus_paid');
  });

  it('blocks a non-admin from the payout scan', async () => {
    const { agent } = await loginAs('driver', '9980000008');
    const res = await agent.post('/api/admin/referrals/check-payouts');
    expect(res.status).toBe(403);
  });
});
