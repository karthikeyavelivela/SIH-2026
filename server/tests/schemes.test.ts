import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Federation } from '../src/models/Federation';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { SchemePlan } from '../src/models/SchemePlan';
import { SchemeEnrolment } from '../src/models/SchemeEnrolment';
import { Notification } from '../src/models/Notification';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';
import { runSchemeRenewals } from '../src/services/scheme.service';
import { poolBalance } from '../src/services/welfarePool.service';
import { writeLedgerEntry } from '../src/services/ledger.service';

/*
 * The premium figures used below are TEST NUMBERS chosen for the arithmetic.
 * They are not the government's published figures, which this product does not
 * hold until an admin enters them with a source.
 */
const SOURCE = 'https://example.test/scheme-circular';
const DAY = 86_400_000;

let n = 0;
async function person(role: string, extra: Record<string, unknown> = {}) {
  n += 1;
  const user = await User.create({ name: `Person ${n}`, phone: `9${String(500000000 + n).padStart(9, '0')}`, passwordHash: await bcrypt.hash('x', 4), role, accountStatus: 'active', ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function world(affiliated = true) {
  const district = await Federation.create({ name: 'Guntur District', type: 'district', region: 'Guntur', registrationNumber: `R${n}${Date.now() % 1000}`, registeredUnderAct: 'AP Cooperative Societies Act 1964', contactDetails: {} });
  const leader = await person('mutha_leader');
  const member = await person('mutha_member');
  const mutha = await Mutha.create({
    name: 'S',
    leaderId: leader.user._id,
    memberIds: [member.user._id],
    inviteCode: `S${n}${Date.now() % 10000}`,
    region: 'Guntur',
    ...(affiliated ? { districtFederationId: district._id, affiliationStatus: 'affiliated' } : {}),
  });
  const proxy = await person('mutha_member', { phone: `proxy-${new Types.ObjectId()}`, leaderManaged: true, managedByMuthaId: mutha._id });
  await Mutha.updateOne({ _id: mutha._id }, { $push: { memberIds: proxy.user._id } });
  const admin = await person('admin');
  return { district, leader, member, mutha, proxy, admin };
}

const fund = (districtId: Types.ObjectId, amount: number) =>
  writeLedgerEntry({ type: 'welfare_pool_contribution', entityType: 'Federation', entityId: districtId.toString(), amount, description: 'test funding' });

const enrolBody = { bankName: 'State Bank', accountLast4: '4321', nominee: { name: 'Sita', relation: 'spouse' }, consent: true };

async function setFigures(admin: { agent: request.Agent }, code: 'pmsby' | 'pmjjby', premiumAnnual: number) {
  return admin.agent.put(`/api/admin/scheme-plans/${code}`).send({ premiumAnnual, sourceUrl: SOURCE, sourceNote: 'test' });
}

describe('plans', () => {
  it('both schemes exist with NO figures until an admin sets them, and say enrolment goes through the bank', async () => {
    const { member } = await world();
    const res = await member.agent.get('/api/schemes');
    expect(res.status).toBe(200);
    expect(res.body.label).toBe("Enrolment through the member's bank");
    expect(res.body.plans.map((p: { code: string }) => p.code)).toEqual(['pmjjby', 'pmsby']);
    for (const p of res.body.plans) expect(p).toMatchObject({ premiumAnnual: null, coverageAmount: null, premiumKnown: false });
  });

  it('an admin sets the figures with a source link; nobody else can, and a link is required', async () => {
    const { member, admin } = await world();
    const no = await member.agent.put('/api/admin/scheme-plans/pmsby').send({ premiumAnnual: 10, sourceUrl: SOURCE });
    expect(no.status).toBe(403);
    expect((await admin.agent.put('/api/admin/scheme-plans/pmsby').send({ premiumAnnual: 10 })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/scheme-plans/pmsby').send({ premiumAnnual: 10, sourceUrl: 'not a link' })).status).toBe(400);
    expect((await admin.agent.put('/api/admin/scheme-plans/pmsby').send({ premiumAnnual: 0, sourceUrl: SOURCE })).status).toBe(400);
    const ok = await setFigures(admin, 'pmsby', 12);
    expect(ok.status).toBe(200);
    expect(ok.body.plan).toMatchObject({ code: 'pmsby', premiumAnnual: 12, premiumKnown: true, sourceUrl: SOURCE });
    expect(await AuditLog.countDocuments({ action: 'scheme_plan_figures_set' })).toBe(1);
    expect((await admin.agent.put('/api/admin/scheme-plans/other').send({ premiumAnnual: 10, sourceUrl: SOURCE })).status).toBe(400);
  });
});

describe('recording an enrolment', () => {
  it('needs consent, stores the nominee and only the last four digits, and is labelled as through the bank', async () => {
    const { member } = await world();
    expect((await member.agent.post('/api/schemes/pmsby/enrol').send({ ...enrolBody, consent: false })).status).toBe(400);
    expect((await member.agent.post('/api/schemes/pmsby/enrol').send({ ...enrolBody, accountLast4: '123456789' })).status).toBe(400);
    const res = await member.agent.post('/api/schemes/pmsby/enrol').send(enrolBody);
    expect(res.status).toBe(201);
    expect(res.body.enrolment).toMatchObject({ scheme: 'pmsby', status: 'recorded', bankName: 'State Bank', accountLast4: '4321', nominee: { name: 'Sita', relation: 'spouse' }, consentOnBehalf: false, label: "Enrolment through the member's bank" });
    expect(res.body.enrolment.renewalDate).toBeUndefined(); // no clock until the bank confirms
  });

  it('one live enrolment per scheme per person, but the two schemes are separate', async () => {
    const { member } = await world();
    expect((await member.agent.post('/api/schemes/pmsby/enrol').send(enrolBody)).status).toBe(201);
    expect((await member.agent.post('/api/schemes/pmsby/enrol').send(enrolBody)).status).toBe(409);
    expect((await member.agent.post('/api/schemes/pmjjby/enrol').send(enrolBody)).status).toBe(201);
    expect((await member.agent.get('/api/schemes/mine')).body.enrolments).toHaveLength(2);
  });

  it('the bank reference confirms it and starts the twelve-month renewal clock', async () => {
    const { member } = await world();
    const id = (await member.agent.post('/api/schemes/pmsby/enrol').send(enrolBody)).body.enrolment._id;
    const res = await member.agent.post(`/api/schemes/enrolments/${id}/bank-confirmation`).send({ bankReference: 'SBI/PMSBY/778899' });
    expect(res.status).toBe(200);
    expect(res.body.enrolment).toMatchObject({ status: 'confirmed_by_bank', bankReference: 'SBI/PMSBY/778899' });
    const due = new Date(res.body.enrolment.renewalDate).getTime();
    expect(Math.abs(due - Date.now() - 365 * DAY)).toBeLessThan(2 * DAY);
    expect((await member.agent.post(`/api/schemes/enrolments/${id}/bank-confirmation`).send({ bankReference: 'again' })).status).toBe(409);
  });

  it('giving the bank reference up front records it as confirmed at once', async () => {
    const { member } = await world();
    const res = await member.agent.post('/api/schemes/pmjjby/enrol').send({ ...enrolBody, bankReference: 'REF-1' });
    expect(res.body.enrolment.status).toBe('confirmed_by_bank');
    expect(res.body.enrolment.renewalDate).toBeDefined();
  });

  it('a society leader can record one for a member who has no phone, marked as on their behalf; only for their own', async () => {
    const { leader, proxy, member } = await world();
    const other = await world();
    const ok = await leader.agent.post('/api/schemes/pmsby/enrol').send({ ...enrolBody, memberId: proxy.user._id.toString() });
    expect(ok.status).toBe(201);
    expect(ok.body.enrolment.consentOnBehalf).toBe(true);
    expect((await SchemeEnrolment.findOne({ userId: proxy.user._id }).lean())!.recordedByUserId.toString()).toBe(leader.user._id.toString());
    // not another society's member, and not a member who has a phone of their own
    expect((await other.leader.agent.post('/api/schemes/pmsby/enrol').send({ ...enrolBody, memberId: proxy.user._id.toString() })).status).toBe(404);
    expect((await leader.agent.post('/api/schemes/pmjjby/enrol').send({ ...enrolBody, memberId: member.user._id.toString() })).status).toBe(404);
    // the leader can see it, and confirm it with the bank's reference
    const list = await leader.agent.get('/api/schemes/society');
    expect(list.body.enrolments).toHaveLength(1);
    expect(list.body.enrolments[0].memberName).toBe(proxy.user.name);
    const confirm = await leader.agent.post(`/api/schemes/enrolments/${ok.body.enrolment._id}/bank-confirmation`).send({ bankReference: 'BR-99' });
    expect(confirm.status).toBe(200);
    expect((await member.agent.get('/api/schemes/society')).status).toBe(403);
  });

  it('nobody else can confirm someone else’s enrolment', async () => {
    const { member, proxy } = await world();
    const stranger = await person('mutha_member');
    const id = (await member.agent.post('/api/schemes/pmsby/enrol').send(enrolBody)).body.enrolment._id;
    expect((await stranger.agent.post(`/api/schemes/enrolments/${id}/bank-confirmation`).send({ bankReference: 'XYZ123' })).status).toBe(404);
    void proxy;
  });
});

async function confirmedDue(w: Awaited<ReturnType<typeof world>>, code: 'pmsby' | 'pmjjby' = 'pmsby', daysOverdue = 2) {
  const res = await w.member.agent.post(`/api/schemes/${code}/enrol`).send({ ...enrolBody, bankReference: `REF-${n}` });
  const id = res.body.enrolment._id as string;
  await SchemeEnrolment.updateOne({ _id: id }, { renewalDate: new Date(Date.now() - daysOverdue * DAY) });
  return id;
}

describe('the yearly premium, from the district welfare pool', () => {
  it('is HELD, not debited, while the premium figure has not been set; the leader is told once', async () => {
    const w = await world();
    await fund(w.district._id, 1000);
    const id = await confirmedDue(w);
    const first = await runSchemeRenewals();
    expect(first).toEqual([expect.objectContaining({ enrolmentId: id, outcome: 'held_premium_not_set', amount: null })]);
    await runSchemeRenewals();
    expect(await LedgerEntry.countDocuments({ type: 'scheme_premium' })).toBe(0);
    expect(await poolBalance(w.district._id)).toBe(1000);
    const notes = await Notification.find({ userId: w.leader.user._id, type: 'insurance_scheme' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toMatch(/premium figure has not been confirmed/);
    expect((await SchemeEnrolment.findById(id).lean())!.renewalHold?.reason).toBe('premium_not_set');
  });

  it('a figure without a source does not count as set', async () => {
    const w = await world();
    await fund(w.district._id, 1000);
    await SchemePlan.updateOne({ code: 'pmsby' }, { $set: { premiumAnnual: 12 } }, { upsert: true });
    await confirmedDue(w);
    expect((await runSchemeRenewals())[0].outcome).toBe('held_premium_not_set');
  });

  it('once the figure is set, it is debited from the pool through the ledger and the renewal moves on a year', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 100);
    const id = await confirmedDue(w);
    const before = (await SchemeEnrolment.findById(id).lean())!.renewalDate!;
    const out = await runSchemeRenewals();
    expect(out).toEqual([expect.objectContaining({ enrolmentId: id, outcome: 'debited', amount: 20, districtId: w.district._id.toString() })]);

    const entries = await LedgerEntry.find({ type: 'scheme_premium' }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ entityType: 'Federation', amount: 20, status: 'posted' });
    expect(entries[0].entityId.toString()).toBe(w.district._id.toString());
    expect(await poolBalance(w.district._id)).toBe(80);

    const after = (await SchemeEnrolment.findById(id).lean())!;
    expect(after.premiums).toHaveLength(1);
    expect(after.premiums[0]).toMatchObject({ amount: 20 });
    expect(after.renewalDate!.getTime()).toBeGreaterThan(before.getTime() + 360 * DAY);
    expect(after.renewalHold).toBeUndefined();
    expect(await AuditLog.countDocuments({ action: 'scheme_premium_debited' })).toBe(1);
    expect((await Notification.findOne({ userId: w.member.user._id, type: 'insurance_scheme' }).lean())!.body).toMatch(/₹20 .* paid from the district welfare pool/);
  });

  it('running it again debits nothing more: the same year is never paid twice', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 100);
    await confirmedDue(w);
    await runSchemeRenewals();
    expect(await runSchemeRenewals()).toEqual([]);
    expect(await LedgerEntry.countDocuments({ type: 'scheme_premium' })).toBe(1);
    expect(await poolBalance(w.district._id)).toBe(80);
  });

  it('two runs at once still pay once (the renewal is claimed before it is paid)', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 100);
    await confirmedDue(w);
    await Promise.all([runSchemeRenewals(), runSchemeRenewals()]);
    expect(await LedgerEntry.countDocuments({ type: 'scheme_premium' })).toBe(1);
  });

  it('is held when the pool cannot cover it, never taking the pool below zero; paid once the pool is topped up', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 15);
    const id = await confirmedDue(w);
    expect((await runSchemeRenewals())[0].outcome).toBe('held_pool_insufficient');
    expect(await poolBalance(w.district._id)).toBe(15);
    expect((await Notification.find({ userId: w.leader.user._id, type: 'insurance_scheme' }).lean())[0].body).toMatch(/does not have enough money/);
    await fund(w.district._id, 10);
    expect((await runSchemeRenewals())[0].outcome).toBe('debited');
    expect(await poolBalance(w.district._id)).toBe(5);
    expect((await SchemeEnrolment.findById(id).lean())!.renewalHold).toBeUndefined();
  });

  it('is held for a member whose society is not affiliated to a district, since no pool covers them', async () => {
    const w = await world(false);
    await setFigures(w.admin, 'pmsby', 20);
    await confirmedDue(w);
    const out = await runSchemeRenewals();
    expect(out[0].outcome).toBe('held_no_district');
    expect(await LedgerEntry.countDocuments({ type: 'scheme_premium' })).toBe(0);
  });

  it('draws the pool down across several renewals in one run, so it cannot be overspent', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await setFigures(w.admin, 'pmjjby', 20);
    await fund(w.district._id, 30);
    await confirmedDue(w, 'pmsby');
    await confirmedDue(w, 'pmjjby');
    const dry = await runSchemeRenewals({ dryRun: true });
    expect(dry.map((r) => r.outcome).sort()).toEqual(['held_pool_insufficient', 'would_debit']);
    const real = await runSchemeRenewals();
    expect(real.map((r) => r.outcome).sort()).toEqual(['debited', 'held_pool_insufficient']);
    expect(await poolBalance(w.district._id)).toBe(10);
  });

  it('a dry run computes the plan and writes nothing; only enrolments that are due are in it', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 100);
    const id = await confirmedDue(w);
    const notDue = await world();
    await notDue.member.agent.post('/api/schemes/pmsby/enrol').send({ ...enrolBody, bankReference: 'FUTURE' }); // renewal a year away
    const dry = await runSchemeRenewals({ dryRun: true });
    expect(dry).toEqual([expect.objectContaining({ enrolmentId: id, outcome: 'would_debit', amount: 20 })]);
    expect(await LedgerEntry.countDocuments({ type: 'scheme_premium' })).toBe(0);
    expect((await SchemeEnrolment.findById(id).lean())!.premiums).toHaveLength(0);
  });

  it('an enrolment the bank has not confirmed is never charged', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 100);
    await w.member.agent.post('/api/schemes/pmsby/enrol').send(enrolBody);
    await SchemeEnrolment.updateMany({}, { renewalDate: new Date(Date.now() - DAY) });
    expect(await runSchemeRenewals()).toEqual([]);
  });

  it('admin can run the dry run (default) or a real run over HTTP; others cannot', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 100);
    await confirmedDue(w);
    const dry = await w.admin.agent.post('/api/admin/scheme-plans/renewals/run');
    expect(dry.body).toMatchObject({ dryRun: true, results: [expect.objectContaining({ outcome: 'would_debit' })] });
    expect(await LedgerEntry.countDocuments({ type: 'scheme_premium' })).toBe(0);
    expect((await w.member.agent.post('/api/admin/scheme-plans/renewals/run')).status).toBe(403);
    const real = await w.admin.agent.post('/api/admin/scheme-plans/renewals/run?dryRun=false');
    expect(real.body.results[0].outcome).toBe('debited');
  });

  it('the welfare pool balance the federation sees already reflects premiums', async () => {
    const w = await world();
    await setFigures(w.admin, 'pmsby', 20);
    await fund(w.district._id, 50);
    await confirmedDue(w);
    await runSchemeRenewals();
    expect(await poolBalance(w.district._id)).toBe(30);
  });

  it('messages go out in the recipient’s language', async () => {
    const w = await world();
    await User.updateOne({ _id: w.leader.user._id }, { preferredLocale: 'te' });
    await fund(w.district._id, 10);
    await confirmedDue(w);
    await runSchemeRenewals();
    expect((await Notification.findOne({ userId: w.leader.user._id, type: 'insurance_scheme' }).lean())!.body).toMatch(/రెన్యువల్ వేచి ఉంది/);
  });
});
