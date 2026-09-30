import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Booking } from '../src/models/Booking';
import { CallbackRequest } from '../src/models/CallbackRequest';
import { signAccessToken } from '../src/services/token.service';
import { sendSms, smsReady, toE164, render } from '../src/services/sms.service';
import { sendOtpSms } from '../src/services/otp.service';
import { smsBookingConfirmed, smsProxyAssignments } from '../src/services/smsNotify.service';

const mutableEnv = env as unknown as Record<string, unknown>;
const realFetch = global.fetch;
const KEYS = ['SMS_PROVIDER', 'MSG91_AUTH_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM', 'SMS_TEMPLATE_IDS', 'IVR_ENABLED', 'IVR_SHARED_SECRET'];
const savedMockOtp = env.MOCK_OTP;

interface Call {
  url: string;
  init: RequestInit;
  json?: Record<string, unknown>;
  form?: URLSearchParams;
}
function spyFetch(status = 200): Call[] {
  const calls: Call[] = [];
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => {
    const c: Call = { url: String(url), init: init ?? {} };
    const body = String(init?.body ?? '');
    try {
      c.json = JSON.parse(body);
    } catch {
      c.form = new URLSearchParams(body);
    }
    calls.push(c);
    return new Response('{}', { status });
  }) as unknown as typeof fetch;
  return calls;
}

const TEMPLATES = JSON.stringify({
  otp: { en: 'flow-otp-en', te: 'flow-otp-te' },
  password_reset: { en: 'flow-reset-en' },
  booking_confirmed: { en: 'flow-conf-en', hi: 'flow-conf-hi' },
  proxy_assignment: { en: 'flow-proxy-en' },
});

function msg91() {
  mutableEnv.SMS_PROVIDER = 'msg91';
  mutableEnv.MSG91_AUTH_KEY = 'auth-key-1';
  mutableEnv.SMS_TEMPLATE_IDS = TEMPLATES;
}

afterEach(() => {
  global.fetch = realFetch;
  for (const k of KEYS) mutableEnv[k] = undefined;
  mutableEnv.MOCK_OTP = savedMockOtp;
  jest.restoreAllMocks();
});

describe('the SMS sender', () => {
  it('does nothing when no provider is set, or its credentials are missing', async () => {
    const calls = spyFetch();
    expect(smsReady()).toBe(false);
    expect(await sendSms('9876543210', 'otp', { OTP: '123456' })).toEqual({ ok: false, reason: 'not_configured' });
    mutableEnv.SMS_PROVIDER = 'msg91'; // no key
    expect(smsReady()).toBe(false);
    mutableEnv.SMS_PROVIDER = 'twilio'; // no sid, token or from
    expect(smsReady()).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('MSG91: posts the flow id for the language, the authkey, the number in full, and the named variables', async () => {
    msg91();
    const calls = spyFetch();
    expect(await sendSms('9876543210', 'otp', { OTP: '123456' }, 'te')).toEqual({ ok: true, provider: 'msg91' });
    expect(calls[0].url).toBe('https://control.msg91.com/api/v5/flow/');
    expect((calls[0].init.headers as Record<string, string>).authkey).toBe('auth-key-1');
    expect(calls[0].json).toEqual({ template_id: 'flow-otp-te', short_url: '0', recipients: [{ mobiles: '919876543210', OTP: '123456' }] });
  });

  it('MSG91: falls back to the English flow for a language with none, and refuses with no flow at all', async () => {
    msg91();
    const calls = spyFetch();
    await sendSms('9876543210', 'password_reset', { OTP: '1' }, 'hi');
    expect(calls[0].json?.template_id).toBe('flow-reset-en');
    mutableEnv.SMS_TEMPLATE_IDS = JSON.stringify({});
    expect(await sendSms('9876543210', 'otp', { OTP: '1' })).toEqual({ ok: false, reason: 'no_template_id' });
    mutableEnv.SMS_TEMPLATE_IDS = 'not json';
    expect(await sendSms('9876543210', 'otp', { OTP: '1' })).toEqual({ ok: false, reason: 'no_template_id' });
    expect(calls).toHaveLength(1);
  });

  it('Twilio: basic auth, the number in E.164, and the rendered text in the chosen language', async () => {
    mutableEnv.SMS_PROVIDER = 'twilio';
    mutableEnv.TWILIO_ACCOUNT_SID = 'AC123';
    mutableEnv.TWILIO_AUTH_TOKEN = 'tok';
    mutableEnv.TWILIO_FROM = '+15005550006';
    const calls = spyFetch();
    expect(await sendSms('09876543210'.slice(1), 'booking_confirmed', { WORKER: 'Ravi', WHEN: 'soon' }, 'hi')).toEqual({ ok: true, provider: 'twilio' });
    expect(calls[0].url).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('AC123:tok').toString('base64')}`);
    expect(calls[0].form?.get('To')).toBe('+919876543210');
    expect(calls[0].form?.get('From')).toBe('+15005550006');
    expect(calls[0].form?.get('Body')).toBe('आपकी FYRO बुकिंग पक्की हो गई है। Ravi soon आएँगे।');
  });

  it('refuses a number that is not an Indian mobile (including a proxy placeholder) and a missing variable', async () => {
    msg91();
    const calls = spyFetch();
    expect(await sendSms('proxy-abc123', 'otp', { OTP: '1' })).toEqual({ ok: false, reason: 'not_a_mobile_number' });
    expect(await sendSms('12345', 'otp', { OTP: '1' })).toEqual({ ok: false, reason: 'not_a_mobile_number' });
    expect(await sendSms('9876543210', 'otp', {})).toEqual({ ok: false, reason: 'missing_variable_OTP' });
    expect(calls).toHaveLength(0);
    expect(toE164('+91 98765 43210')).toBe('+919876543210');
    expect(toE164('0123456789')).toBeNull();
  });

  it('reports a provider error, a timeout and a dead host as reasons, never a throw', async () => {
    msg91();
    spyFetch(500);
    expect(await sendSms('9876543210', 'otp', { OTP: '1' })).toEqual({ ok: false, reason: 'msg91_http_500' });
    global.fetch = jest.fn(async () => {
      const e = new Error('t');
      e.name = 'TimeoutError';
      throw e;
    }) as unknown as typeof fetch;
    expect(await sendSms('9876543210', 'otp', { OTP: '1' })).toEqual({ ok: false, reason: 'timeout' });
    global.fetch = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    expect(await sendSms('9876543210', 'otp', { OTP: '1' })).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('every template has wording in all three languages and uses exactly its declared variables', () => {
    const { SMS_TEMPLATES } = jest.requireActual('../src/services/sms.service') as typeof import('../src/services/sms.service');
    for (const t of Object.values(SMS_TEMPLATES)) {
      for (const lang of ['en', 'te', 'hi'] as const) {
        const used = [...t.text[lang].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
        expect(used).toEqual([...t.vars].sort());
      }
      expect(t.text.te).not.toBe(t.text.en);
      expect(t.text.hi).not.toBe(t.text.en);
    }
    expect(render('otp', { OTP: '42' }, 'en')).toContain('42');
  });
});

describe('OTP by SMS', () => {
  it('sends nothing in mock mode, sends through the provider otherwise, and throws rather than pretend', async () => {
    mutableEnv.MOCK_OTP = true;
    const none = spyFetch();
    await sendOtpSms('9876543210', '123456');
    expect(none).toHaveLength(0);

    mutableEnv.MOCK_OTP = false;
    await expect(sendOtpSms('9876543210', '123456')).rejects.toThrow(/No SMS provider is configured/);
    msg91();
    const calls = spyFetch();
    await sendOtpSms('9876543210', '123456');
    expect(calls[0].json?.recipients).toEqual([{ mobiles: '919876543210', OTP: '123456' }]);
    spyFetch(503);
    await expect(sendOtpSms('9876543210', '123456')).rejects.toThrow(/could not be sent/);
  });
});

let n = 0;
async function user(role: string, extra: Record<string, unknown> = {}) {
  n += 1;
  return User.create({ name: `U${n}`, phone: `9${String(800000000 + n).padStart(9, '0')}`, passwordHash: await bcrypt.hash('OldPassw0rd!', 4), role, ...extra });
}

describe('forgot password', () => {
  it('says plainly when a code cannot reach a phone, and does not collect one', async () => {
    mutableEnv.MOCK_OTP = false;
    const status = await request(app).get('/api/auth/forgot-password/status');
    expect(status.body).toEqual({ available: false });
    const u = await user('customer');
    const r = await request(app).post('/api/auth/forgot-password/start').send({ phone: u.phone });
    expect(r.status).toBe(503);
    expect(r.body.error).toMatch(/not available yet/i);
    expect((await User.findById(u._id).lean())!.pendingPasswordReset).toBeUndefined();
  });

  it('mock mode (development): the whole flow works and the old password stops working', async () => {
    mutableEnv.MOCK_OTP = true;
    const u = await user('customer');
    const start = await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.0.1').send({ phone: u.phone });
    expect(start.status).toBe(200);
    expect(start.body.devOtp).toMatch(/^\d{6}$/);

    const done = await request(app)
      .post('/api/auth/forgot-password/complete')
      .set('X-Forwarded-For', '10.8.0.1')
      .send({ phone: u.phone, otp: start.body.devOtp, newPassword: 'NewPassw0rd!' });
    expect(done.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.8.0.2').send({ phone: u.phone, password: 'OldPassw0rd!' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.8.0.3').send({ phone: u.phone, password: 'NewPassw0rd!' });
    expect(newLogin.status).toBe(200);

    const after = (await User.findById(u._id).lean())!;
    expect(after.pendingPasswordReset).toBeUndefined();
    expect(after.tokenVersion).toBe(1); // signed out everywhere
  });

  it('an unknown number gets the same answer as a real one, without a code', async () => {
    mutableEnv.MOCK_OTP = true;
    const r = await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.0.4').send({ phone: '9111111111' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it('a wrong code is refused, five wrong codes lock the code, and the right one then no longer works', async () => {
    mutableEnv.MOCK_OTP = true;
    const u = await user('customer');
    const start = await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.1.1').send({ phone: u.phone });
    for (let i = 0; i < 5; i++) {
      const bad = await request(app).post('/api/auth/forgot-password/complete').set('X-Forwarded-For', `10.8.1.${10 + i}`).send({ phone: u.phone, otp: '000000', newPassword: 'NewPassw0rd!' });
      expect(bad.status).toBe(400);
    }
    const tooLate = await request(app).post('/api/auth/forgot-password/complete').set('X-Forwarded-For', '10.8.1.30').send({ phone: u.phone, otp: start.body.devOtp, newPassword: 'NewPassw0rd!' });
    expect(tooLate.status).toBe(400);
    expect((await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.8.1.31').send({ phone: u.phone, password: 'OldPassw0rd!' })).status).toBe(200);
  });

  it('an expired code is refused, and so is a completion that was never started', async () => {
    mutableEnv.MOCK_OTP = true;
    const u = await user('customer');
    const start = await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.2.1').send({ phone: u.phone });
    await User.updateOne({ _id: u._id }, { 'pendingPasswordReset.expiresAt': new Date(Date.now() - 1000) });
    expect((await request(app).post('/api/auth/forgot-password/complete').set('X-Forwarded-For', '10.8.2.2').send({ phone: u.phone, otp: start.body.devOtp, newPassword: 'NewPassw0rd!' })).status).toBe(400);
    const other = await user('customer');
    expect((await request(app).post('/api/auth/forgot-password/complete').set('X-Forwarded-For', '10.8.2.3').send({ phone: other.phone, otp: '123456', newPassword: 'NewPassw0rd!' })).status).toBe(400);
  });

  it('asking again inside a minute does not send a second code', async () => {
    mutableEnv.MOCK_OTP = false;
    msg91();
    const calls = spyFetch();
    const u = await user('customer');
    await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.3.1').send({ phone: u.phone });
    await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.3.2').send({ phone: u.phone });
    expect(calls).toHaveLength(1);
  });

  it('with a provider: the code goes out by SMS in the person’s language and never comes back in the response', async () => {
    mutableEnv.MOCK_OTP = false;
    msg91();
    mutableEnv.SMS_TEMPLATE_IDS = JSON.stringify({ password_reset: { en: 'flow-reset-en', te: 'flow-reset-te' } });
    const calls = spyFetch();
    const u = await user('customer', { preferredLocale: 'te' });
    const r = await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.4.1').send({ phone: u.phone });
    expect(r.status).toBe(200);
    expect(r.body.devOtp).toBeUndefined();
    expect(calls[0].json?.template_id).toBe('flow-reset-te');
    const sentCode = ((calls[0].json?.recipients as Record<string, string>[])[0]).OTP;
    expect(sentCode).toMatch(/^\d{6}$/);
    expect(JSON.stringify(r.body)).not.toContain(sentCode);
    const done = await request(app).post('/api/auth/forgot-password/complete').set('X-Forwarded-For', '10.8.4.2').send({ phone: u.phone, otp: sentCode, newPassword: 'NewPassw0rd!' });
    expect(done.status).toBe(200);
  });

  it('with a provider that fails, says so instead of pretending a code is on its way', async () => {
    mutableEnv.MOCK_OTP = false;
    msg91();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    spyFetch(500);
    const u = await user('customer');
    const r = await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.5.1').send({ phone: u.phone });
    expect(r.status).toBe(502);
  });

  it('validates input and limits attempts per number', async () => {
    mutableEnv.MOCK_OTP = true;
    expect((await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', '10.8.6.1').send({ phone: '1' })).status).toBe(400);
    expect((await request(app).post('/api/auth/forgot-password/complete').set('X-Forwarded-For', '10.8.6.2').send({ phone: '9111111112', otp: '123456', newPassword: 'short' })).status).toBe(400);
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await request(app).post('/api/auth/forgot-password/start').set('X-Forwarded-For', `10.8.7.${i}`).send({ phone: '9222222222' })).status;
    expect(last).toBe(429);
  });
});

describe('SMS about a booking', () => {
  function booking(customerId: Types.ObjectId, extra: Record<string, unknown> = {}) {
    return Booking.create({
      customerId,
      type: 'hamali',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { type: 'Point', coordinates: [80, 16], address: 'Gandhi Road, Guntur' },
      dropLocation: { type: 'Point', coordinates: [80, 16], address: 'b' },
      requiredHamaliCount: 1,
      status: 'accepted',
      fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 100, total: 110 },
      ...extra,
    });
  }

  it('tells the customer the booking is confirmed and who is coming, in their language', async () => {
    msg91();
    const calls = spyFetch();
    const customer = await user('customer', { preferredLocale: 'hi' });
    const worker = await user('hamali_solo');
    const b = await booking(customer._id, { assignedHamaliIds: [worker._id] });
    await smsBookingConfirmed(b);
    expect(calls).toHaveLength(1);
    expect(calls[0].json).toMatchObject({ template_id: 'flow-conf-hi', recipients: [{ WORKER: worker.name, WHEN: 'जल्द' }] });
    expect(calls[0].json?.recipients).toEqual([expect.objectContaining({ mobiles: `91${customer.phone}` })]);
  });

  it('respects the customer’s SMS setting, and reads nothing when SMS is not set up', async () => {
    msg91();
    const calls = spyFetch();
    const customer = await user('customer', { 'notificationPreferences.sms.jobUpdates': false });
    await smsBookingConfirmed(await booking(customer._id));
    expect(calls).toHaveLength(0);
    mutableEnv.SMS_PROVIDER = undefined;
    const b = await booking(customer._id);
    const spy = jest.spyOn(User, 'findById');
    await smsBookingConfirmed(b);
    expect(spy).not.toHaveBeenCalled();
  });

  it('tells the society leader when a member without a phone is given a job', async () => {
    msg91();
    const calls = spyFetch();
    const leader = await user('mutha_leader');
    const mutha = await Mutha.create({ name: 'S', leaderId: leader._id, memberIds: [], inviteCode: 'AB12CD' });
    const proxy = await user('mutha_member', { phone: `proxy-${new Types.ObjectId()}`, leaderManaged: true, managedByMuthaId: mutha._id });
    const real = await user('mutha_member', { managedByMuthaId: mutha._id });
    mutha.memberIds = [proxy._id, real._id];
    await mutha.save();
    const customer = await user('customer');
    const b = await booking(customer._id, { assignedHamaliIds: [proxy._id, real._id] });
    await smsProxyAssignments(b, [proxy._id, real._id]);
    expect(calls).toHaveLength(1); // only the member without a phone, and it goes to the leader
    expect(calls[0].json).toMatchObject({ template_id: 'flow-proxy-en', recipients: [{ mobiles: `91${leader.phone}`, MEMBER: proxy.name, PLACE: 'Gandhi Road' }] });
  });

  it('a failed send never throws into the booking', async () => {
    msg91();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    spyFetch(500);
    const customer = await user('customer');
    await expect(smsBookingConfirmed(await booking(customer._id))).resolves.toBeUndefined();
  });
});

const SECRET = 'ivr-secret-0123456789-abcdefgh';

function ivrOn() {
  mutableEnv.IVR_ENABLED = true;
  mutableEnv.IVR_SHARED_SECRET = SECRET;
}

describe('the Exotel IVR', () => {
  it('refuses everything when off, or with the wrong secret', async () => {
    const off = await request(app).get('/api/ivr/exotel/next-assignment').query({ token: SECRET, From: '09876543210' });
    expect(off.status).toBe(403);
    ivrOn();
    expect((await request(app).get('/api/ivr/exotel/next-assignment').query({ token: 'wrong-secret-0123456789-abcd', From: '09876543210' })).status).toBe(403);
    expect((await request(app).get('/api/ivr/exotel/callback-request').query({ From: '09876543210', CallSid: 'x' })).status).toBe(403);
    expect(await CallbackRequest.countDocuments()).toBe(0);
  });

  it('a leader hears the next jobs of members without phones, in the language asked for', async () => {
    ivrOn();
    const leader = await user('mutha_leader', { preferredLocale: 'te' });
    const mutha = await Mutha.create({ name: 'S', leaderId: leader._id, memberIds: [], inviteCode: 'ZZ99YY' });
    const proxy = await user('mutha_member', { name: 'Lakshmi', phone: `proxy-${new Types.ObjectId()}`, leaderManaged: true, managedByMuthaId: mutha._id });
    mutha.memberIds = [proxy._id];
    await mutha.save();
    const customer = await user('customer');
    await Booking.create({
      customerId: customer._id,
      type: 'hamali',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { type: 'Point', coordinates: [80, 16], address: 'Gandhi Road, Guntur' },
      dropLocation: { type: 'Point', coordinates: [80, 16], address: 'b' },
      requiredHamaliCount: 1,
      assignedHamaliIds: [proxy._id],
      assignedMuthaId: mutha._id,
      status: 'accepted',
      scheduledFor: new Date('2026-10-05T04:30:00Z'),
      fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 100, total: 110 },
    });

    for (const from of [`0${leader.phone}`, `+91${leader.phone}`, leader.phone]) {
      const r = await request(app).get('/api/ivr/exotel/next-assignment').query({ token: SECRET, From: from, CallSid: 'c1' });
      expect(r.status).toBe(200);
      expect(r.headers['content-type']).toMatch(/text\/plain/);
      expect(r.text).toContain('Lakshmi');
      expect(r.text).toContain('5/10 10:00'); // 04:30 UTC is 10:00 IST
      expect(r.text).toContain('Gandhi Road');
      expect(r.text).toMatch(/పని ఉంది/); // Telugu, from the leader's own language
    }
    const hindi = await request(app).get('/api/ivr/exotel/next-assignment').query({ token: SECRET, From: leader.phone, lang: 'hi' });
    expect(hindi.text).toMatch(/काम है/);
  });

  it('says there is nothing waiting, and says an unknown caller is not registered', async () => {
    ivrOn();
    const leader = await user('mutha_leader');
    await Mutha.create({ name: 'S', leaderId: leader._id, memberIds: [], inviteCode: 'QQ11WW' });
    const none = await request(app).get('/api/ivr/exotel/next-assignment').query({ token: SECRET, From: leader.phone, lang: 'en' });
    expect(none.text).toMatch(/no jobs waiting/i);
    const stranger = await request(app).get('/api/ivr/exotel/next-assignment').query({ token: SECRET, From: '9000000099', lang: 'en' });
    expect(stranger.text).toMatch(/not registered/i);
    const customer = await user('customer');
    const asCustomer = await request(app).get('/api/ivr/exotel/next-assignment').query({ token: SECRET, From: customer.phone, lang: 'en' });
    expect(asCustomer.text).toMatch(/not registered/i); // only leaders hear assignments
  });

  it('a callback request is recorded once per call, and thanks the caller in their language', async () => {
    ivrOn();
    const q = { token: SECRET, From: '+919876500001', CallSid: 'call-1', digits: '1', lang: 'hi' };
    const a = await request(app).get('/api/ivr/exotel/callback-request').query(q);
    const b = await request(app).get('/api/ivr/exotel/callback-request').query(q);
    expect(a.text).toMatch(/धन्यवाद/);
    expect(b.status).toBe(200);
    const all = await CallbackRequest.find().lean();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ phone: '9876500001', callSid: 'call-1', language: 'hi', digits: '1', status: 'open' });
  });

  it('staff can see open requests and mark one done; nobody else can', async () => {
    ivrOn();
    await request(app).get('/api/ivr/exotel/callback-request').query({ token: SECRET, From: '9876500002', CallSid: 'call-2', lang: 'te' });
    const admin = await user('admin');
    const cookie = [`accessToken=${signAccessToken({ id: admin._id.toString(), role: 'admin' })}`];
    const list = await request(app).get('/api/admin/callback-requests').set('Cookie', cookie);
    expect(list.body.requests).toHaveLength(1);
    const id = list.body.requests[0]._id;
    expect((await request(app).patch(`/api/admin/callback-requests/${id}/done`).set('Cookie', cookie)).status).toBe(200);
    expect((await request(app).get('/api/admin/callback-requests').set('Cookie', cookie)).body.requests).toHaveLength(0);
    expect((await request(app).get('/api/admin/callback-requests?status=done').set('Cookie', cookie)).body.requests).toHaveLength(1);
    expect((await request(app).patch(`/api/admin/callback-requests/${id}/done`).set('Cookie', cookie)).status).toBe(404);

    const customer = await user('customer');
    const c = [`accessToken=${signAccessToken({ id: customer._id.toString(), role: 'customer' })}`];
    expect((await request(app).get('/api/admin/callback-requests').set('Cookie', c)).status).toBe(403);
    expect((await request(app).get('/api/admin/callback-requests')).status).toBe(401);
  });
});
