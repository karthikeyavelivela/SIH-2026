import './setup';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Payout } from '../src/models/Payout';
import { generateEarningsPayouts } from '../src/services/payoutGeneration.service';

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function makeCompletedTruckBooking(driverId: string, total: number, completedAt: Date) {
  const customer = await User.create({ name: 'C', phone: `98500${Math.floor(Math.random() * 100000)}`, passwordHash: 'x', role: 'customer' });
  return Booking.create({
    customerId: customer._id,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    assignedDriverIds: [driverId],
    status: 'completed',
    fareBreakdown: { baseFare: 150, distanceFare: total - 150, surgeMultiplier: 1, hamaliFare: 0, total },
    statusHistory: [
      { status: 'accepted', timestamp: new Date(completedAt.getTime() - 3600_000) },
      { status: 'completed', timestamp: completedAt },
    ],
  });
}

describe('generateEarningsPayouts (AUDIT_REPORT.md Phase 1.5)', () => {
  it('creates a pending earnings Payout for a driver with real completed-booking earnings in the window', async () => {
    const driver = await User.create({ name: 'D', phone: '9850000001', passwordHash: 'x', role: 'driver' });
    await makeCompletedTruckBooking(driver._id.toString(), 500, new Date());

    const result = await generateEarningsPayouts(30);
    expect(result.created).toBe(1);
    expect(result.totalAmount).toBeGreaterThan(0);

    const payout = await Payout.findOne({ userId: driver._id, source: 'earnings' });
    expect(payout).not.toBeNull();
    expect(payout!.status).toBe('pending');
    expect(payout!.amount).toBe(result.totalAmount);
  });

  it('does not generate a payout for a worker with zero completed bookings in the window', async () => {
    await User.create({ name: 'D', phone: '9850000002', passwordHash: 'x', role: 'driver' });
    const result = await generateEarningsPayouts(30);
    expect(result.created).toBe(0);
  });

  it('excludes a booking completed outside the trailing window', async () => {
    const driver = await User.create({ name: 'D', phone: '9850000003', passwordHash: 'x', role: 'driver' });
    await makeCompletedTruckBooking(driver._id.toString(), 500, new Date(Date.now() - 60 * 86_400_000)); // 60 days ago

    const result = await generateEarningsPayouts(30);
    expect(result.created).toBe(0);
    expect(result.skippedZeroEarnings).toBe(0); // never even considered — no completed booking in window at all
  });

  it('is idempotent per (userId, period): running twice for the same period does not create a second Payout', async () => {
    const driver = await User.create({ name: 'D', phone: '9850000004', passwordHash: 'x', role: 'driver' });
    await makeCompletedTruckBooking(driver._id.toString(), 500, new Date());

    const first = await generateEarningsPayouts(30);
    expect(first.created).toBe(1);

    const second = await generateEarningsPayouts(30);
    expect(second.created).toBe(0);
    expect(second.skippedAlreadyExists).toBe(1);

    const payouts = await Payout.find({ userId: driver._id, source: 'earnings' });
    expect(payouts).toHaveLength(1);
  });

  it('only considers driver/hamali_solo/mutha_member — never a customer, even if somehow referenced', async () => {
    const customer = await User.create({ name: 'C', phone: '9850000005', passwordHash: 'x', role: 'customer' });
    const result = await generateEarningsPayouts(30);
    expect(result.created).toBe(0);
    const payout = await Payout.findOne({ userId: customer._id });
    expect(payout).toBeNull();
  });

  it('regenerates for a NEW period once the previous one was rejected (rejected does not block re-generation)', async () => {
    const driver = await User.create({ name: 'D', phone: '9850000006', passwordHash: 'x', role: 'driver' });
    await makeCompletedTruckBooking(driver._id.toString(), 500, new Date());
    await generateEarningsPayouts(30);

    await Payout.updateOne({ userId: driver._id, source: 'earnings' }, { status: 'rejected' });

    const second = await generateEarningsPayouts(30);
    expect(second.created).toBe(1); // a rejected payout for the same period doesn't block a fresh one

    const payouts = await Payout.find({ userId: driver._id, source: 'earnings' });
    expect(payouts).toHaveLength(2);
  });
});
