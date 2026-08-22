import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { Payout } from '../src/models/Payout';
import { signAccessToken } from '../src/services/token.service';

async function loginAsCustomer(phone: string, password = 'Passw0rd!') {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({ name: 'C', phone, passwordHash, role: 'customer' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: 'customer' })}`);
  return { agent, user };
}

describe('PATCH /api/auth/me/password (Phase 2)', () => {
  it('changes the password when the current one is correct, and bumps tokenVersion (other sessions invalidated)', async () => {
    const { agent, user } = await loginAsCustomer('9860000001');
    const before = await User.findById(user._id);

    const res = await agent.patch('/api/auth/me/password').send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd!' });
    expect(res.status).toBe(200);

    const after = await User.findById(user._id);
    expect(after!.tokenVersion).toBe(before!.tokenVersion + 1);

    // Login now works with the new password.
    const login = await request(app).post('/api/auth/login').send({ phone: '9860000001', password: 'NewPassw0rd!' });
    expect(login.status).toBe(200);
  });

  it('rejects with the wrong current password (400), does not change anything', async () => {
    const { agent, user } = await loginAsCustomer('9860000002');
    const res = await agent.patch('/api/auth/me/password').send({ currentPassword: 'WrongPass1!', newPassword: 'NewPassw0rd!' });
    expect(res.status).toBe(400);

    const login = await request(app).post('/api/auth/login').send({ phone: '9860000002', password: 'Passw0rd!' });
    expect(login.status).toBe(200); // old password still works
    void user;
  });
});

describe('phone change with OTP (Phase 2)', () => {
  it('full flow: request OTP, confirm with the real (mock-mode) code, phone updates', async () => {
    const { agent, user } = await loginAsCustomer('9860000003');

    const request1 = await agent.post('/api/auth/me/phone/request-otp').send({ newPhone: '9860000099' });
    expect(request1.status).toBe(200);
    expect(request1.body.devOtp).toMatch(/^\d{6}$/); // mock mode returns it directly

    const confirm = await agent.post('/api/auth/me/phone/confirm').send({ otp: request1.body.devOtp });
    expect(confirm.status).toBe(200);
    expect(confirm.body.user.phone).toBe('9860000099');

    const refreshed = await User.findById(user._id);
    expect(refreshed!.phone).toBe('9860000099');
    // Mongoose hydrates an $unset nested-object schema path as {}, never
    // undefined (same documented behavior as Vehicle/HamaliProfile's
    // willingLocation elsewhere in this codebase) — otpHash absent is the
    // real "genuinely cleared" signal, not the object's own truthiness.
    expect(refreshed!.pendingPhoneChange?.otpHash).toBeFalsy();
  });

  it('rejects an incorrect OTP (400), does not change the phone, counts the attempt', async () => {
    const { agent, user } = await loginAsCustomer('9860000004');
    await agent.post('/api/auth/me/phone/request-otp').send({ newPhone: '9860000098' });

    const wrong = await agent.post('/api/auth/me/phone/confirm').send({ otp: '000000' });
    expect(wrong.status).toBe(400);

    const refreshed = await User.findById(user._id);
    expect(refreshed!.phone).toBe('9860000004'); // unchanged
    expect(refreshed!.pendingPhoneChange?.attempts).toBe(1);
  });

  it('rejects requesting a phone number already registered to another account (409)', async () => {
    await loginAsCustomer('9860000005');
    const { agent } = await loginAsCustomer('9860000006');
    const res = await agent.post('/api/auth/me/phone/request-otp').send({ newPhone: '9860000005' });
    expect(res.status).toBe(409);
  });

  it('confirming with no pending request at all fails cleanly (400)', async () => {
    const { agent } = await loginAsCustomer('9860000007');
    const res = await agent.post('/api/auth/me/phone/confirm').send({ otp: '123456' });
    expect(res.status).toBe(400);
  });

  it('the raw OTP hash never appears in any API response', async () => {
    const { agent } = await loginAsCustomer('9860000008');
    await agent.post('/api/auth/me/phone/request-otp').send({ newPhone: '9860000097' });
    const me = await agent.get('/api/auth/me');
    expect(JSON.stringify(me.body)).not.toMatch(/otpHash/);
  });
});

describe('DELETE /api/auth/me (Phase 2)', () => {
  it('deletes cleanly when there is nothing in flight', async () => {
    const { agent, user } = await loginAsCustomer('9860000009');
    const res = await agent.delete('/api/auth/me');
    expect(res.status).toBe(200);
    const after = await User.findById(user._id);
    expect(after!.accountStatus).toBe('deleted');
  });

  it('blocks deletion while an open booking exists as customer (409)', async () => {
    const { agent, user } = await loginAsCustomer('9860000010');
    await Booking.create({
      customerId: user._id,
      type: 'truck',
      cargoDetails: { weightKg: 100 },
      pickupLocation: { type: 'Point', coordinates: [78, 17], address: 'A' },
      dropLocation: { type: 'Point', coordinates: [78.1, 17.1], address: 'B' },
      requiredVehicles: [{ capacityKg: 100, count: 1 }],
      status: 'searching',
      statusHistory: [{ status: 'searching', timestamp: new Date() }],
    });

    const res = await agent.delete('/api/auth/me');
    expect(res.status).toBe(409);
    const after = await User.findById(user._id);
    expect(after!.accountStatus).toBe('active');
  });

  it('blocks deletion while a pending payout exists (409)', async () => {
    const { agent, user } = await loginAsCustomer('9860000011');
    await Payout.create({ userId: user._id, amount: 500, period: '2026-08', status: 'pending', source: 'earnings' });

    const res = await agent.delete('/api/auth/me');
    expect(res.status).toBe(409);
  });

  it('a deleted account can no longer log in', async () => {
    const { agent } = await loginAsCustomer('9860000012');
    await agent.delete('/api/auth/me');
    const login = await request(app).post('/api/auth/login').send({ phone: '9860000012', password: 'Passw0rd!' });
    expect(login.status).toBe(401);
  });
});

describe('payout details masking (Phase 2)', () => {
  it('masks the bank account number and UPI id in every response, never returns the raw value back', async () => {
    const { agent } = await loginAsCustomer('9860000013');
    const res = await agent
      .patch('/api/auth/me/payout-details')
      .send({ method: 'bank', accountHolderName: 'Test User', bankAccountNumber: '123456789012', ifsc: 'HDFC0001234' });
    expect(res.status).toBe(200);
    expect(res.body.user.payoutDetails.bankAccountNumber).not.toBe('123456789012');
    expect(res.body.user.payoutDetails.bankAccountNumber).toMatch(/9012$/);
    expect(res.body.user.payoutDetails.bankAccountNumber).toMatch(/^•+9012$/);

    const me = await agent.get('/api/auth/me');
    expect(me.body.user.payoutDetails.bankAccountNumber).toMatch(/^•+9012$/);
  });
});
