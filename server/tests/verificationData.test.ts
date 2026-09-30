import './setup';
import request from 'supertest';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

// R10 — what a verification account creates is verification data, and stays
// out of the platform's numbers.

async function user(phone: string, role: string, isVerification = false) {
  return User.create({ name: phone, phone, passwordHash: 'x', role, accountStatus: 'active', isVerification });
}

const pt = (lng: number, lat: number) => ({ type: 'Point' as const, coordinates: [lng, lat], address: 'a' });
function booking(customerId: Types.ObjectId, total: number) {
  return Booking.create({
    customerId,
    type: 'hamali',
    region: 'VERIFY',
    cargoDetails: { weightKg: 0, description: 'x' },
    pickupLocation: pt(80, 16),
    dropLocation: pt(80, 16),
    status: 'completed',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: total, total },
  });
}

describe('verification data — R10', () => {
  it('a booking made by a verification customer is marked verification without the creator asking', async () => {
    const v = await user('9100000091', 'customer', true);
    const real = await user('9100000092', 'customer', false);
    const vb = await booking(v._id, 500);
    const rb = await booking(real._id, 300);
    expect((await Booking.findById(vb._id).lean())!.isVerification).toBe(true);
    expect((await Booking.findById(rb._id).lean())!.isVerification).toBeFalsy();
  });

  it('admin stats and public stats count only real bookings', async () => {
    const v = await user('9100000093', 'customer', true);
    const real = await user('9100000094', 'customer', false);
    const admin = await user('9100000095', 'admin');
    await booking(v._id, 1000);
    await booking(real._id, 200);

    const token = signAccessToken({ id: admin._id.toString(), role: 'admin' as never });
    const stats = await request(app).get('/api/admin/stats').set('Cookie', [`accessToken=${token}`]);
    expect(stats.status).toBe(200);
    expect(JSON.stringify(stats.body)).toContain('200');
    expect(JSON.stringify(stats.body)).not.toContain('1200');

    const pub = await request(app).get('/api/public/stats');
    expect(pub.status).toBe(200);
    expect(pub.body.stats.completedJobs).toBe(1);
    expect(pub.body.stats.settledValue).toBe(200);
  });
});
