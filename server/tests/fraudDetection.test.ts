import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { FraudCase } from '../src/models/FraudCase';
import { FraudSignal } from '../src/models/FraudSignal';
import { signAccessToken } from '../src/services/token.service';
import {
  detectZeroDistanceFullFare,
  detectAbnormalCancellationRate,
  detectRapidAccountCreation,
} from '../src/services/fraudDetection.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function makeBooking(customerId: string, overrides: Partial<{ distanceKm: number; total: number; status: string }> = {}) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 100 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'A' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'B' },
    requiredVehicles: [{ capacityKg: 100, count: 1 }],
    status: overrides.status ?? 'completed',
    distanceKm: overrides.distanceKm ?? 0,
    fareBreakdown: { baseFare: 200, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: overrides.total ?? 500 },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

describe('Phase 6 — fraud detection (real signals, never auto-suspend)', () => {
  it('zero_distance_full_fare raises a signal + open case for a near-zero-distance, high-fare booking', async () => {
    const { user } = await loginAs('customer', '9830000001');
    const booking = await makeBooking(user._id.toString(), { distanceKm: 0.1, total: 500 });

    await detectZeroDistanceFullFare(booking._id.toString());

    const signals = await FraudSignal.find({ userId: user._id });
    expect(signals).toHaveLength(1);
    expect(signals[0].detectorType).toBe('zero_distance_full_fare');

    const fraudCase = await FraudCase.findOne({ userId: user._id });
    expect(fraudCase).not.toBeNull();
    expect(fraudCase!.status).toBe('open');
  });

  it('does NOT raise a signal for a plausible short-hop low-fare booking', async () => {
    const { user } = await loginAs('customer', '9830000002');
    const booking = await makeBooking(user._id.toString(), { distanceKm: 0.1, total: 200 });

    await detectZeroDistanceFullFare(booking._id.toString());

    expect(await FraudSignal.countDocuments({ userId: user._id })).toBe(0);
  });

  it('abnormal_cancellation_rate raises a signal once a customer has cancelled most of >=5 recent bookings', async () => {
    const { user } = await loginAs('customer', '9830000003');
    for (let i = 0; i < 4; i++) await makeBooking(user._id.toString(), { status: 'cancelled' });
    await makeBooking(user._id.toString(), { status: 'completed' });

    await detectAbnormalCancellationRate(user._id.toString());

    const signals = await FraudSignal.find({ userId: user._id, detectorType: 'abnormal_cancellation_rate' });
    expect(signals).toHaveLength(1);
  });

  it('does not raise abnormal_cancellation_rate below the minimum sample size', async () => {
    const { user } = await loginAs('customer', '9830000004');
    await makeBooking(user._id.toString(), { status: 'cancelled' });

    await detectAbnormalCancellationRate(user._id.toString());

    expect(await FraudSignal.countDocuments({ userId: user._id })).toBe(0);
  });

  it('rapid_account_creation clusters accounts sharing a signup IP within the window, on the newest account', async () => {
    const ip = '10.0.0.5';
    const u1 = await User.create({ name: 'A', phone: '9830000005', passwordHash: 'x', role: 'customer', signupIp: ip });
    const u2 = await User.create({ name: 'B', phone: '9830000006', passwordHash: 'x', role: 'customer', signupIp: ip });
    const u3 = await User.create({ name: 'C', phone: '9830000007', passwordHash: 'x', role: 'customer', signupIp: ip });

    await detectRapidAccountCreation(u3._id.toString(), ip);

    // Only the account that TRIGGERED the check (the 3rd) gets a signal —
    // it's the one whose signup crossed the threshold.
    const signals = await FraudSignal.find({ detectorType: 'rapid_account_creation' });
    expect(signals).toHaveLength(1);
    expect(signals[0].userId.toString()).toBe(u3._id.toString());
    expect((signals[0].evidence as { accountsFromThisIp: number }).accountsFromThisIp).toBe(3);
    void u1;
    void u2;
  });

  it('two signals for the same user cluster into ONE case, not two', async () => {
    const { user } = await loginAs('customer', '9830000008');
    const b1 = await makeBooking(user._id.toString(), { distanceKm: 0.1, total: 500 });
    const b2 = await makeBooking(user._id.toString(), { distanceKm: 0.1, total: 600 });

    await detectZeroDistanceFullFare(b1._id.toString());
    await detectZeroDistanceFullFare(b2._id.toString());

    expect(await FraudCase.countDocuments({ userId: user._id })).toBe(1);
    const fraudCase = await FraudCase.findOne({ userId: user._id });
    expect(fraudCase!.signalIds).toHaveLength(2);
  });
});

describe('Phase 6 — admin fraud case queue (never auto-suspends)', () => {
  it('a detected signal never touches accountStatus until an admin explicitly resolves it', async () => {
    const { user } = await loginAs('customer', '9830000009');
    const booking = await makeBooking(user._id.toString(), { distanceKm: 0.1, total: 500 });
    await detectZeroDistanceFullFare(booking._id.toString());

    const reloaded = await User.findById(user._id);
    expect(reloaded!.accountStatus).toBe('active');
  });

  it('admin can list, investigate, and resolve a case as "clear" (false positive) — account stays active', async () => {
    const { user } = await loginAs('customer', '9830000010');
    const booking = await makeBooking(user._id.toString(), { distanceKm: 0.1, total: 500 });
    await detectZeroDistanceFullFare(booking._id.toString());
    const fraudCase = await FraudCase.findOne({ userId: user._id });

    const { agent: adminAgent } = await loginAs('admin', '9830000011');

    const list = await adminAgent.get('/api/admin/fraud/cases');
    expect(list.status).toBe(200);
    expect(list.body.cases.some((c: { _id: string }) => c._id === fraudCase!._id.toString())).toBe(true);

    const investigate = await adminAgent.patch(`/api/admin/fraud/cases/${fraudCase!._id}/investigate`);
    expect(investigate.status).toBe(200);
    expect(investigate.body.case.status).toBe('investigating');

    const resolve = await adminAgent
      .patch(`/api/admin/fraud/cases/${fraudCase!._id}/resolve`)
      .send({ resolution: 'clear', notes: 'False positive — legitimate short move.' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.case.status).toBe('cleared');

    const reloadedUser = await User.findById(user._id);
    expect(reloadedUser!.accountStatus).toBe('active');
  });

  it('admin resolving a case as "suspend" DOES set accountStatus to suspended — the one real consequence', async () => {
    const { user } = await loginAs('customer', '9830000012');
    const booking = await makeBooking(user._id.toString(), { distanceKm: 0.1, total: 500 });
    await detectZeroDistanceFullFare(booking._id.toString());
    const fraudCase = await FraudCase.findOne({ userId: user._id });

    const { agent: adminAgent } = await loginAs('admin', '9830000013');
    const resolve = await adminAgent
      .patch(`/api/admin/fraud/cases/${fraudCase!._id}/resolve`)
      .send({ resolution: 'suspend', notes: 'Confirmed fraud.' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.case.status).toBe('suspended');

    const reloadedUser = await User.findById(user._id);
    expect(reloadedUser!.accountStatus).toBe('suspended');
  });

  it('a non-admin cannot reach the fraud case queue', async () => {
    const { agent } = await loginAs('customer', '9830000014');
    const res = await agent.get('/api/admin/fraud/cases');
    expect(res.status).toBe(403);
  });
});
