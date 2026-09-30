import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { ConsentRecord } from '../src/models/ConsentRecord';
import { User } from '../src/models/User';
import { PRIVACY_NOTICE_VERSION } from '@fyro/shared';

const all = { identity_verification: true, matching_location: true, payments: true, welfare_administration: true, analytics: false };

// authLimiter allows 5 signups a minute per IP; each call here comes from its own.
let n = 0;
async function signup(phone: string, consent?: unknown) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/signup/customer').set('X-Forwarded-For', `10.9.0.${++n}`).send({ name: 'Asha', phone, password: 'Passw0rd!', ...(consent ? { consent } : {}) });
  return { agent, res };
}

describe('P1.8 consent at signup', () => {
  it('stores a versioned record for the new account', async () => {
    const { agent, res } = await signup('9300000001', { purposes: all });
    expect(res.status).toBe(201);
    const rows = await ConsentRecord.find({ userId: res.body.user._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ noticeVersion: PRIVACY_NOTICE_VERSION, source: 'signup' });
    const got = await agent.get('/api/auth/me/consents');
    expect(got.body.consent).toMatchObject({ current: true, purposes: { payments: true, analytics: false } });
  });

  it('refuses to create an account when a required purpose is off, and creates nothing', async () => {
    const { res } = await signup('9300000002', { purposes: { ...all, payments: false } });
    expect(res.status).toBe(400);
    expect(await User.countDocuments({ phone: '9300000002' })).toBe(0);
  });

  it('a signup with no consent still works, and the account reads as not yet consented', async () => {
    const { agent, res } = await signup('9300000003');
    expect(res.status).toBe(201);
    const got = await agent.get('/api/auth/me/consents');
    expect(got.body.consent.current).toBe(false);
  });
});

describe('P1.8 viewing and withdrawing', () => {
  it('analytics can be withdrawn and given again; every change is a new row; required ones cannot be switched off', async () => {
    const { agent, res } = await signup('9300000004', { purposes: { ...all, analytics: true } });
    const id = res.body.user._id;

    const off = await agent.put('/api/auth/me/consents').send({ purposes: { analytics: false } });
    expect(off.status).toBe(200);
    expect(off.body.consent.purposes.analytics).toBe(false);

    // Trying to drop a required purpose is ignored, not honoured.
    const tryRequired = await agent.put('/api/auth/me/consents').send({ purposes: { payments: false } });
    expect(tryRequired.body.consent.purposes.payments).toBe(true);

    const on = await agent.put('/api/auth/me/consents').send({ purposes: { analytics: true } });
    expect(on.body.consent.purposes.analytics).toBe(true);
    const history = await ConsentRecord.find({ userId: id }).sort({ createdAt: 1 }).lean();
    expect(history.length).toBe(4);
    expect(history.map((h) => h.purposes.analytics)).toEqual([true, false, false, true]);
  });

  it('someone with no record accepts the current notice in one call', async () => {
    const { agent } = await signup('9300000005');
    const before = await agent.put('/api/auth/me/consents').send({ purposes: { analytics: true } });
    expect(before.status).toBe(409);
    const accept = await agent.put('/api/auth/me/consents').send({ acceptNotice: true });
    expect(accept.body.consent).toMatchObject({ current: true });
  });

  it('requires sign-in', async () => {
    expect((await request(app).get('/api/auth/me/consents')).status).toBe(401);
    expect((await request(app).get('/api/auth/me/export')).status).toBe(401);
  });
});

describe('P1.8 data export', () => {
  it('returns the person’s own data with no secrets, and not anyone else’s', async () => {
    const { agent } = await signup('9300000006', { purposes: all });
    await signup('9300000007', { purposes: all });
    const res = await agent.get('/api/auth/me/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('fyro-my-data.json');
    expect(res.body.account.phone).toBe('9300000006');
    expect(res.body.consents).toHaveLength(1);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('passwordHash');
    expect(text).not.toContain('9300000007');
  });
});
