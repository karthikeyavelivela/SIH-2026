import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Federation } from '../src/models/Federation';
import { EShramRecord } from '../src/models/EShramRecord';
import { PoliceVerification } from '../src/models/PoliceVerification';
import { Notification } from '../src/models/Notification';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';
import { addMonths, runPoliceVerificationReminders } from '../src/services/policeVerification.service';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const DAY = 86_400_000;

let n = 0;
async function person(role: string, extra: Record<string, unknown> = {}) {
  n += 1;
  const user = await User.create({ name: `Person ${n}`, phone: `9${String(600000000 + n).padStart(9, '0')}`, passwordHash: await bcrypt.hash('x', 4), role, accountStatus: 'active', ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function society() {
  const leader = await person('mutha_leader');
  const worker = await person('mutha_member');
  const mutha = await Mutha.create({ name: 'S', leaderId: leader.user._id, memberIds: [worker.user._id], inviteCode: `S${n}${Date.now() % 10000}` });
  return { leader, worker, mutha };
}

describe('e-Shram — P4.4', () => {
  it('records the 12-digit number, shows only the last four digits, and audits without the full number', async () => {
    const { agent, user } = await person('hamali_solo');
    expect((await agent.get('/api/eshram')).body).toEqual({ registered: false, hasCard: false });
    const put = await agent.put('/api/eshram').send({ uan: '123456789012' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ registered: true, hasCard: false, uanMasked: '••••••••9012' });
    expect(JSON.stringify(put.body)).not.toContain('123456789012');
    expect(JSON.stringify((await agent.get('/api/eshram')).body)).not.toContain('123456789012');
    const audit = await AuditLog.find({ targetId: user._id.toString(), action: 'eshram_uan_recorded' }).lean();
    expect(JSON.stringify(audit)).not.toContain('123456789012');
    expect(audit[0].details).toEqual({ last4: '9012' });
  });

  it('refuses anything but 12 digits', async () => {
    const { agent } = await person('hamali_solo');
    for (const uan of ['12345', '12345678901a', '1234567890123', '']) {
      expect((await agent.put('/api/eshram').send({ uan })).status).toBe(400);
    }
  });

  it('takes a card only after a number, keeps it private, and lets only the owner open it', async () => {
    const { agent } = await person('hamali_solo');
    expect((await agent.post('/api/eshram/card').send({ fileBase64: PNG })).status).toBe(409);
    await agent.put('/api/eshram').send({ uan: '123456789012' });
    const card = await agent.post('/api/eshram/card').send({ fileBase64: PNG });
    expect(card.status).toBe(200);
    expect(card.body.hasCard).toBe(true);
    expect((await agent.get('/api/eshram/card/url')).status).toBe(200);
    const stranger = await person('hamali_solo');
    expect((await stranger.agent.get('/api/eshram/card/url')).status).toBe(404); // has no card of their own
    expect((await agent.post('/api/eshram/card').send({ fileBase64: 'nope' })).status).toBe(400);
  });

  it('requires sign-in', async () => {
    expect((await request(app).get('/api/eshram')).status).toBe(401);
  });

  it('the federation dashboard counts recorded numbers, and says recorded rather than verified', async () => {
    const fed = await Federation.create({ name: 'D', type: 'district', region: 'Guntur', registrationNumber: 'R1', registeredUnderAct: 'AP Cooperative Societies Act 1964', contactDetails: {} });
    const { worker, leader, mutha } = await society();
    const second = await person('mutha_member');
    await Mutha.updateOne({ _id: mutha._id }, { memberIds: [worker.user._id, second.user._id], districtFederationId: fed._id, affiliationStatus: 'affiliated' });
    await EShramRecord.create({ userId: worker.user._id, uan: '123456789012' });
    const admin = await person('federation_district_admin', { federationId: fed._id });
    const res = await admin.agent.get('/api/federation/me');
    expect(res.status).toBe(200);
    // three people: the leader and two members; one has recorded a number
    expect(res.body.counts.eShramRecorded).toBe(1);
    expect(res.body.counts.eShramRecordedPct).toBeCloseTo(33.3, 1);
    void leader;
  });
});

describe('police verification — P4.4', () => {
  it('a worker submits, sees it pending, and cannot have two pending at once', async () => {
    const { worker } = await society();
    const r = await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/2026/0042', fileBase64: PNG });
    expect(r.status).toBe(201);
    expect(r.body.verification).toMatchObject({ status: 'pending', hasFile: true, validNow: false });
    expect((await worker.agent.post('/api/police-verification').send({ referenceNumber: 'again' })).status).toBe(409);
    expect((await worker.agent.get('/api/police-verification')).body.verifications).toHaveLength(1);
  });

  it('needs the certificate or its reference', async () => {
    const { worker } = await society();
    expect((await worker.agent.post('/api/police-verification').send({})).status).toBe(400);
  });

  it('the society leader approves: twelve months, the badge date is set, and the worker is told', async () => {
    const { leader, worker } = await society();
    const sub = await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/1', fileBase64: PNG });
    const queue = await leader.agent.get('/api/police-verification/queue');
    expect(queue.body.queue.map((q: { _id: string }) => q._id)).toContain(sub.body.verification._id);
    expect(queue.body.queue[0].workerName).toBe(worker.user.name);

    const ok = await leader.agent.patch(`/api/police-verification/${sub.body.verification._id}`).send({ decision: 'verified' });
    expect(ok.status).toBe(200);
    expect(ok.body.verification).toMatchObject({ status: 'verified', validNow: true });
    const expires = new Date(ok.body.verification.expiresAt).getTime();
    expect(Math.abs(expires - addMonths(new Date(), 12).getTime())).toBeLessThan(5000);
    expect(ok.body.verification.daysLeft).toBeGreaterThanOrEqual(364);

    const stored = (await User.findById(worker.user._id).lean())!;
    expect(stored.policeVerifiedUntil!.getTime()).toBe(expires);
    const me = await worker.agent.get('/api/auth/me');
    expect(new Date(me.body.user.policeVerifiedUntil).getTime()).toBe(expires); // the profile badge reads this
    expect((await Notification.find({ userId: worker.user._id, type: 'police_verification' }).lean())[0].body).toMatch(/approved until/);
    expect(await AuditLog.countDocuments({ action: 'police_verification_approved' })).toBe(1);
  });

  it('a rejection needs a reason, and the worker can then submit again', async () => {
    const { leader, worker } = await society();
    const sub = await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/2' });
    const id = sub.body.verification._id;
    expect((await leader.agent.patch(`/api/police-verification/${id}`).send({ decision: 'rejected' })).status).toBe(400);
    const no = await leader.agent.patch(`/api/police-verification/${id}`).send({ decision: 'rejected', reason: 'The photo is cut off' });
    expect(no.body.verification).toMatchObject({ status: 'rejected', rejectionReason: 'The photo is cut off' });
    expect((await Notification.find({ userId: worker.user._id, type: 'police_verification' }).lean())[0].body).toMatch(/cut off/);
    expect((await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/3' })).status).toBe(201);
    expect((await User.findById(worker.user._id).lean())!.policeVerifiedUntil).toBeUndefined();
  });

  it('a decision is final, and only one of these can be reviewed once', async () => {
    const { leader, worker } = await society();
    const id = (await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/4' })).body.verification._id;
    await leader.agent.patch(`/api/police-verification/${id}`).send({ decision: 'verified' });
    expect((await leader.agent.patch(`/api/police-verification/${id}`).send({ decision: 'rejected', reason: 'x' })).status).toBe(409);
  });

  it('nobody outside the worker’s society can review or read it, and nobody approves their own', async () => {
    const { worker } = await society();
    const other = await society();
    const id = (await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/5', fileBase64: PNG })).body.verification._id;
    expect((await other.leader.agent.patch(`/api/police-verification/${id}`).send({ decision: 'verified' })).status).toBe(404);
    expect((await other.leader.agent.get(`/api/police-verification/${id}/url`)).status).toBe(404);
    expect((await other.leader.agent.get('/api/police-verification/queue')).body.queue).toEqual([]);
    expect((await worker.agent.patch(`/api/police-verification/${id}`).send({ decision: 'verified' })).status).toBe(404);
    const customer = await person('customer');
    expect((await customer.agent.get('/api/police-verification/queue')).status).toBe(403);
    // a leader's own certificate cannot be approved by that leader
    const mine = (await other.leader.agent.post('/api/police-verification').send({ referenceNumber: 'L1' })).body.verification._id;
    expect((await other.leader.agent.patch(`/api/police-verification/${mine}`).send({ decision: 'verified' })).status).toBe(404);
  });

  it('an admin, and a manager with verify_kyc, can review anyone; a manager without it cannot', async () => {
    const { worker } = await society();
    const id = (await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/6', fileBase64: PNG })).body.verification._id;
    const noPerm = await person('manager', { permissions: ['view_analytics'] });
    expect((await noPerm.agent.get('/api/police-verification/queue')).status).toBe(403);
    expect((await noPerm.agent.patch(`/api/police-verification/${id}`).send({ decision: 'verified' })).status).toBe(404);
    const manager = await person('manager', { permissions: ['verify_kyc'] });
    expect((await manager.agent.get('/api/police-verification/queue')).body.queue).toHaveLength(1);
    const url = await manager.agent.get(`/api/police-verification/${id}/url`);
    expect(url.status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'police_verification_document_viewed' })).toBe(1);
    const admin = await person('admin');
    expect((await admin.agent.patch(`/api/police-verification/${id}`).send({ decision: 'verified' })).status).toBe(200);
  });

  it('the worker can open their own document', async () => {
    const { worker } = await society();
    const id = (await worker.agent.post('/api/police-verification').send({ referenceNumber: 'PCC/7', fileBase64: PNG })).body.verification._id;
    expect((await worker.agent.get(`/api/police-verification/${id}/url`)).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'police_verification_document_viewed' })).toBe(0); // viewing your own is not an event
  });

  it('add a year correctly, including 29 February', () => {
    expect(addMonths(new Date('2026-10-05T00:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2027-10-05');
    expect(addMonths(new Date('2028-02-29T00:00:00Z'), 12).toISOString().slice(0, 10)).toBe('2029-02-28');
  });
});

describe('police verification reminders — P4.4', () => {
  async function verifiedWith(expiresInDays: number) {
    const w = await person('mutha_member');
    const r = await PoliceVerification.create({
      userId: w.user._id,
      referenceNumber: 'X',
      status: 'verified',
      reviewedAt: new Date(Date.now() - 300 * DAY),
      expiresAt: new Date(Date.now() + expiresInDays * DAY),
    });
    await User.updateOne({ _id: w.user._id }, { policeVerifiedUntil: r.expiresAt });
    return { w, r };
  }
  const count = (id: Types.ObjectId) => Notification.countDocuments({ userId: id, type: 'police_verification' });

  it('30 days before: one reminder, once however often it runs', async () => {
    const { w } = await verifiedWith(29);
    expect(await runPoliceVerificationReminders()).toEqual({ sent30: 1, sent7: 0, expired: 0 });
    expect(await runPoliceVerificationReminders()).toEqual({ sent30: 0, sent7: 0, expired: 0 });
    expect(await count(w.user._id)).toBe(1);
    expect((await Notification.findOne({ userId: w.user._id }).lean())!.body).toMatch(/expires in 29 days/);
  });

  it('7 days before: another, once; a long way off: none', async () => {
    const soon = await verifiedWith(6);
    const far = await verifiedWith(200);
    expect(await runPoliceVerificationReminders()).toEqual({ sent30: 0, sent7: 1, expired: 0 });
    expect(await runPoliceVerificationReminders()).toEqual({ sent30: 0, sent7: 0, expired: 0 });
    expect(await count(soon.w.user._id)).toBe(1);
    expect(await count(far.w.user._id)).toBe(0);
  });

  it('the walk from 30 to 7 to expired gives three messages in all, and then the badge goes', async () => {
    const { w, r } = await verifiedWith(29);
    await runPoliceVerificationReminders(); // 29 days left
    await runPoliceVerificationReminders(new Date(Date.now() + 23 * DAY)); // 6 days left
    const ended = new Date(Date.now() + 31 * DAY);
    expect(await runPoliceVerificationReminders(ended)).toEqual({ sent30: 0, sent7: 0, expired: 1 });
    expect(await runPoliceVerificationReminders(ended)).toEqual({ sent30: 0, sent7: 0, expired: 0 });
    expect(await count(w.user._id)).toBe(3);
    expect((await User.findById(w.user._id).lean())!.policeVerifiedUntil).toBeUndefined();
    void r;
  });

  it('a newer approval keeps the badge and silences the old one’s reminders', async () => {
    const { w } = await verifiedWith(5);
    await PoliceVerification.create({ userId: w.user._id, status: 'verified', referenceNumber: 'NEW', reviewedAt: new Date(), expiresAt: new Date(Date.now() + 360 * DAY) });
    await User.updateOne({ _id: w.user._id }, { policeVerifiedUntil: new Date(Date.now() + 360 * DAY) });
    expect(await runPoliceVerificationReminders()).toEqual({ sent30: 0, sent7: 0, expired: 0 });
    const ended = new Date(Date.now() + 6 * DAY);
    await runPoliceVerificationReminders(ended);
    expect((await User.findById(w.user._id).lean())!.policeVerifiedUntil).toBeDefined();
  });

  it('reminders are in the worker’s language', async () => {
    const { w } = await verifiedWith(6);
    await User.updateOne({ _id: w.user._id }, { preferredLocale: 'te' });
    await runPoliceVerificationReminders();
    expect((await Notification.findOne({ userId: w.user._id }).lean())!.body).toMatch(/పోలీస్ ధృవీకరణ/);
  });
});
