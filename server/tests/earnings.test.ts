import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeCustomer(phone: string) {
  return User.create({ name: 'Cust', phone, passwordHash: 'x', role: 'customer' });
}

async function makeCompletedCombo(opts: {
  customerPhone: string;
  driverId?: string;
  hamaliIds?: string[];
  muthaId?: string;
  surgeMultiplier?: number;
}) {
  const customer = await makeCustomer(opts.customerPhone);
  const surge = opts.surgeMultiplier ?? 1;
  const baseFare = 100;
  const distanceFare = 50;
  const hamaliFare = 80;
  const total = (baseFare + distanceFare + hamaliFare) * surge;
  return Booking.create({
    customerId: customer._id,
    type: 'combo',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    requiredHamaliCount: opts.hamaliIds?.length ?? 0,
    assignedDriverIds: opts.driverId ? [opts.driverId] : [],
    assignedHamaliIds: opts.hamaliIds ?? [],
    assignedMuthaId: opts.muthaId,
    status: 'completed',
    fareBreakdown: { baseFare, distanceFare, hamaliFare, surgeMultiplier: surge, total },
    statusHistory: [
      { status: 'searching', timestamp: new Date(Date.now() - 10000) },
      { status: 'accepted', timestamp: new Date(Date.now() - 8000) },
      { status: 'in_progress', timestamp: new Date(Date.now() - 5000) },
      { status: 'completed', timestamp: new Date() },
    ],
  });
}

describe('GET /api/earnings/me', () => {
  it('gives a driver the vehicle-side share, surge-scaled', async () => {
    const { agent, user: driver } = await loginAs('driver', '9850000001');
    await makeCompletedCombo({ customerPhone: '9850009001', driverId: driver._id.toString() });

    const res = await agent.get('/api/earnings/me');
    expect(res.status).toBe(200);
    expect(res.body.jobCount).toBe(1);
    // (base 100 + distance 50) * (total 230 / preSurgeSubtotal 230) = 150
    expect(res.body.total).toBe(150);
  });

  it('scales a driver\'s share by surge', async () => {
    const { agent, user: driver } = await loginAs('driver', '9850000002');
    await makeCompletedCombo({
      customerPhone: '9850009002',
      driverId: driver._id.toString(),
      surgeMultiplier: 1.5,
    });

    const res = await agent.get('/api/earnings/me');
    // (150) * (345/230) = 225
    expect(res.body.total).toBe(225);
  });

  it('splits the hamali pool equally across assigned solo hamalis', async () => {
    const { agent: agentA, user: hamaliA } = await loginAs('hamali_solo', '9850000101');
    const { user: hamaliB } = await loginAs('hamali_solo', '9850000102');
    await makeCompletedCombo({
      customerPhone: '9850009003',
      hamaliIds: [hamaliA._id.toString(), hamaliB._id.toString()],
    });

    const res = await agentA.get('/api/earnings/me');
    // hamaliFare 80 * (230/230) = 80, split 2 ways = 40
    expect(res.body.total).toBe(40);
  });

  it('gives a mutha_leader the group total plus a correct per-member breakdown', async () => {
    const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', '9850000201');
    const { user: memberA } = await loginAs('mutha_member', '9850000202');
    const { user: memberB } = await loginAs('mutha_member', '9850000203');
    const mutha = await Mutha.create({
      name: 'G',
      leaderId: leader._id,
      memberIds: [memberA._id, memberB._id],
      inviteCode: 'EARN01',
    });

    await makeCompletedCombo({
      customerPhone: '9850009004',
      hamaliIds: [memberA._id.toString(), memberB._id.toString()],
      muthaId: mutha._id.toString(),
    });

    const res = await leaderAgent.get('/api/earnings/me');
    expect(res.body.total).toBe(80);
    expect(res.body.perMember).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: memberA._id.toString(), total: 40 }),
        expect.objectContaining({ userId: memberB._id.toString(), total: 40 }),
      ])
    );
  });

  it('never includes another driver\'s completed bookings in the total (IDOR guard)', async () => {
    const { user: driverA } = await loginAs('driver', '9850000301');
    const { agent: agentB } = await loginAs('driver', '9850000302');
    await makeCompletedCombo({ customerPhone: '9850009005', driverId: driverA._id.toString() });

    const res = await agentB.get('/api/earnings/me');
    expect(res.body.total).toBe(0);
    expect(res.body.jobCount).toBe(0);
  });
});
