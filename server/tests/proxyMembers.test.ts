import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';
import { ActivityDay } from '../src/models/ActivityDay';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';

/*
 * P1.7 — members with no phone, run by their leader until they claim.
 */

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let seq = 0;

async function agentFor(role: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  const user = await User.create({ name: `P${seq}`, phone: `97220${String(seq).padStart(5, '0')}`, passwordHash: 'x', role, region: 'Vijayawada', ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function society() {
  const { agent, user } = await agentFor('mutha_leader');
  const mutha = await Mutha.create({ name: `Society ${seq}`, leaderId: user._id, memberIds: [], inviteCode: `P${seq++}` });
  return { leader: agent, leaderUser: user, mutha };
}

async function newMember(leader: ReturnType<typeof request.agent>) {
  const res = await leader.post('/api/proxy-members').send({ name: 'Ramulu', skills: ['loading'] });
  expect(res.status).toBe(201);
  return res.body.member._id as string;
}

describe('the leader runs a member who has no phone', () => {
  it('creates an account nobody can sign in to, in the society, with a member profile', async () => {
    const s = await society();
    const id = await newMember(s.leader);
    const u = await User.findById(id).lean();
    expect(u).toMatchObject({ leaderManaged: true, role: 'mutha_member' });
    expect(u!.phone).toBe(`proxy-${id}`);
    expect(String(u!.managedByMuthaId)).toBe(s.mutha._id.toString());
    expect((await Mutha.findById(s.mutha._id).lean())!.memberIds.map(String)).toContain(id);
    expect(await HamaliProfile.exists({ userId: id, type: 'mutha_member', muthaId: s.mutha._id })).toBeTruthy();

    const login = await request(app).post('/api/auth/login').send({ phone: u!.phone, password: 'anything123' });
    expect(login.status).toBe(400);
    const list = await s.leader.get('/api/proxy-members');
    expect(list.body.members).toHaveLength(1);
  });

  it('uploads KYC for them, which still goes to review; they cannot go online until it is verified', async () => {
    const s = await society();
    const id = await newMember(s.leader);
    const up = await s.leader.post(`/api/proxy-members/${id}/kyc`).send({ type: 'aadhaar', fileBase64: TINY_PNG });
    expect(up.status).toBe(200);
    expect(up.body.document).toMatchObject({ type: 'aadhaar', status: 'under_review' });
    await s.leader.post(`/api/proxy-members/${id}/kyc`).send({ type: 'pan', fileBase64: TINY_PNG });

    const { agent: admin } = await agentFor('admin');
    const queue = await admin.get('/api/admin/kyc-queue');
    expect(queue.body.users.map((u: { _id: string }) => u._id)).toContain(id);

    const early = await s.leader.patch(`/api/proxy-members/${id}/availability`).send({ status: 'online', location: { lat: 16.5, lng: 80.65 } });
    expect(early.status).toBe(403);

    await User.updateOne({ _id: id }, { $set: { 'kycDocs.$[].status': 'verified', kycStatus: 'verified' } });
    const online = await s.leader.patch(`/api/proxy-members/${id}/availability`).send({ status: 'online', location: { lat: 16.5, lng: 80.65 } });
    expect(online.status).toBe(200);
    expect(online.body.availabilityStatus).toBe('online');
    expect(await ActivityDay.countDocuments({ userId: id })).toBe(1);
  });

  it('payout details need the consent tick, and the account number never reaches the audit log', async () => {
    const s = await society();
    const id = await newMember(s.leader);
    const body = { method: 'bank', accountHolderName: 'Ramulu', bankAccountNumber: '123456789012', ifsc: 'SBIN0001234' };
    expect((await s.leader.put(`/api/proxy-members/${id}/payout`).send({ ...body, consent: false })).status).toBe(400);
    const ok = await s.leader.put(`/api/proxy-members/${id}/payout`).send({ ...body, consent: true });
    expect(ok.status).toBe(200);
    const u = await User.findById(id).lean();
    expect(u!.payoutDetails?.bankAccountNumber).toBe('123456789012');
    expect(String(u!.payoutConsent?.byUserId)).toBe(s.leaderUser._id.toString());
    const log = await AuditLog.findOne({ action: 'proxy_member_payout_set' }).lean();
    expect(JSON.stringify(log)).not.toContain('123456789012');
  });

  it('earnings are the member’s own', async () => {
    const s = await society();
    const id = await newMember(s.leader);
    const { user: customer } = await agentFor('customer');
    await Booking.create({
      customerId: customer._id,
      type: 'hamali',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { type: 'Point', coordinates: [80.65, 16.5], address: 'A' },
      dropLocation: { type: 'Point', coordinates: [80.65, 16.5], address: 'A' },
      requiredHamaliCount: 2,
      assignedHamaliIds: [id, s.leaderUser._id],
      assignedMuthaId: s.mutha._id,
      status: 'completed',
      fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 600, total: 660, workerRate: 600, serviceFeePct: 10, serviceFee: 60 },
      statusHistory: [{ status: 'completed', timestamp: new Date() }],
    });
    const earnings = await s.leader.get(`/api/proxy-members/${id}/earnings`);
    expect(earnings.body).toMatchObject({ total: 300, jobs: 1 });
  });

  it('another society’s leader cannot touch the member', async () => {
    const s = await society();
    const id = await newMember(s.leader);
    const other = await society();
    expect((await other.leader.get(`/api/proxy-members/${id}/earnings`)).status).toBe(404);
    expect((await other.leader.post(`/api/proxy-members/${id}/claim-code`)).status).toBe(404);
    expect((await other.leader.put(`/api/proxy-members/${id}/payout`).send({ method: 'upi', upiId: 'ramulu@okaxis', consent: true })).status).toBe(404);
    const { agent: worker } = await agentFor('hamali_solo');
    expect((await worker.get('/api/proxy-members')).status).toBe(403);
  });
});

describe('the member claims the account', () => {
  it('code + phone OTP + password makes it theirs; they can then sign in; the code is spent', async () => {
    const s = await society();
    const id = await newMember(s.leader);
    const issued = await s.leader.post(`/api/proxy-members/${id}/claim-code`);
    expect(issued.status).toBe(200);
    const code = issued.body.code as string;
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    expect(JSON.stringify(await User.findById(id).select('+claimCodeHash').lean())).not.toContain(code);

    const start = await request(app).post('/api/proxy-claim/start').send({ code, phone: '9876501234' });
    expect(start.status).toBe(200);
    expect(start.body.devOtp).toMatch(/^\d+$/);

    const wrong = await request(app).post('/api/proxy-claim/complete').send({ code, phone: '9876501234', otp: '000000', password: 'MyOwnPass1' });
    expect(wrong.status).toBe(400);

    const done = await request(app).post('/api/proxy-claim/complete').send({ code, phone: '9876501234', otp: start.body.devOtp, password: 'MyOwnPass1' });
    expect(done.status).toBe(200);
    const u = await User.findById(id).lean();
    expect(u).toMatchObject({ phone: '9876501234', leaderManaged: false });
    expect(u!.claimedAt).toBeTruthy();

    const login = await request(app).post('/api/auth/login').send({ phone: '9876501234', password: 'MyOwnPass1' });
    expect(login.status).toBe(200);
    expect((await request(app).post('/api/proxy-claim/start').send({ code, phone: '9876501235' })).status).toBe(400);
    expect(await AuditLog.countDocuments({ action: 'proxy_member_claimed' })).toBe(1);
  });

  it('refuses a phone that already has an account, and locks after five wrong tries', async () => {
    const s = await society();
    const id = await newMember(s.leader);
    const { user: existing } = await agentFor('customer');
    const { code } = (await s.leader.post(`/api/proxy-members/${id}/claim-code`)).body;
    // Its own client address, so the per-IP auth limiter (5 a minute per
    // path, itself a protection here) does not cut in before the code locks.
    const claim = (path: string, body: object) => request(app).post(`/api/proxy-claim/${path}`).set('X-Forwarded-For', '10.77.0.1').send(body);
    expect((await claim('start', { code, phone: existing.phone })).status).toBe(409);

    await claim('start', { code, phone: '9876509999' });
    for (let i = 0; i < 5; i++) {
      expect((await claim('complete', { code, phone: '9876509999', otp: '000000', password: 'MyOwnPass1' })).status).toBe(400);
    }
    const locked = await claim('start', { code, phone: '9876509999' });
    expect(locked.status).toBe(429);
    expect(locked.body.error).toMatch(/Too many attempts with this code/);
  });
});
