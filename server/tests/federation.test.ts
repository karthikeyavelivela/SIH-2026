import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { Federation } from '../src/models/Federation';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, federationId?: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role, federationId });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function makeStateFederation(regNo = 'AP/COOP/STATE/T001') {
  return Federation.create({
    name: 'Test State Federation',
    type: 'state',
    region: 'Andhra Pradesh',
    registrationNumber: regNo,
    registeredUnderAct: 'AP Cooperative Societies Act 1964',
  });
}

async function makeDistrictFederation(parentId: string, region: string, regNo: string, maxCommission = 10, maxWelfare = 5) {
  return Federation.create({
    name: `${region} District Federation`,
    type: 'district',
    parentFederationId: parentId,
    region,
    registrationNumber: regNo,
    registeredUnderAct: 'AP Cooperative Societies Act 1964',
    maxCommissionRatePct: maxCommission,
    maxWelfareDeductionRatePct: maxWelfare,
  });
}

describe('POST /api/admin/federations — hierarchy creation', () => {
  it('creates a state federation, then a district federation under it', async () => {
    const { agent } = await loginAs('admin', '9970100001');
    const stateRes = await agent.post('/api/admin/federations').send({
      name: 'AP State Federation',
      type: 'state',
      region: 'Andhra Pradesh',
      registrationNumber: 'AP/COOP/STATE/001',
      registeredUnderAct: 'AP Cooperative Societies Act 1964',
    });
    expect(stateRes.status).toBe(201);

    const districtRes = await agent.post('/api/admin/federations').send({
      name: 'Visakhapatnam District Federation',
      type: 'district',
      parentFederationId: stateRes.body.federation._id,
      region: 'Visakhapatnam',
      registrationNumber: 'AP/COOP/DIST/001',
      registeredUnderAct: 'AP Cooperative Societies Act 1964',
      maxCommissionRatePct: 10,
      maxWelfareDeductionRatePct: 5,
    });
    expect(districtRes.status).toBe(201);
    expect(districtRes.body.federation.parentFederationId).toBe(stateRes.body.federation._id);
  });

  it('rejects a district federation with no parentFederationId', async () => {
    const { agent } = await loginAs('admin', '9970100002');
    const res = await agent.post('/api/admin/federations').send({
      name: 'Orphan District',
      type: 'district',
      region: 'Guntur',
      registrationNumber: 'AP/COOP/DIST/ORPHAN',
      registeredUnderAct: 'AP Cooperative Societies Act 1964',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a district federation whose parent is not a state federation', async () => {
    const { agent } = await loginAs('admin', '9970100003');
    const state = await makeStateFederation('AP/COOP/STATE/T003');
    const district = await makeDistrictFederation(state._id.toString(), 'Guntur', 'AP/COOP/DIST/T003A');
    const res = await agent.post('/api/admin/federations').send({
      name: 'Bad Sub-District',
      type: 'district',
      parentFederationId: district._id.toString(),
      region: 'Ongole',
      registrationNumber: 'AP/COOP/DIST/T003B',
      registeredUnderAct: 'AP Cooperative Societies Act 1964',
    });
    expect(res.status).toBe(400);
  });

  it('is admin-only', async () => {
    const { agent } = await loginAs('manager', '9970100004');
    const res = await agent.post('/api/admin/federations').send({
      name: 'X', type: 'state', region: 'X', registrationNumber: 'X', registeredUnderAct: 'X',
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/federations/admins', () => {
  it('creates a federation_district_admin bound to a real district federation', async () => {
    const { agent } = await loginAs('admin', '9970100005');
    const state = await makeStateFederation('AP/COOP/STATE/T005');
    const district = await makeDistrictFederation(state._id.toString(), 'Guntur', 'AP/COOP/DIST/T005');

    const res = await agent.post('/api/admin/federations/admins').send({
      name: 'District Admin',
      phone: '9970100006',
      password: 'Passw0rd!',
      role: 'federation_district_admin',
      federationId: district._id.toString(),
    });
    expect(res.status).toBe(201);
    const created = await User.findOne({ phone: '9970100006' });
    expect(created!.federationId?.toString()).toBe(district._id.toString());
  });

  it("rejects a role/federation-type mismatch (federation_state_admin bound to a district federation)", async () => {
    const { agent } = await loginAs('admin', '9970100007');
    const state = await makeStateFederation('AP/COOP/STATE/T007');
    const district = await makeDistrictFederation(state._id.toString(), 'Kurnool', 'AP/COOP/DIST/T007');
    const res = await agent.post('/api/admin/federations/admins').send({
      name: 'Mismatched',
      phone: '9970100008',
      password: 'Passw0rd!',
      role: 'federation_state_admin',
      federationId: district._id.toString(),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/federation/me — scoped dashboards', () => {
  it("a district admin's dashboard shows only its own affiliated societies, never another district's", async () => {
    const state = await makeStateFederation('AP/COOP/STATE/T010');
    const districtA = await makeDistrictFederation(state._id.toString(), 'Visakhapatnam', 'AP/COOP/DIST/T010A');
    const districtB = await makeDistrictFederation(state._id.toString(), 'Guntur', 'AP/COOP/DIST/T010B');

    const leaderA = await User.create({ name: 'LA', phone: '9970100011', passwordHash: 'x', role: 'mutha_leader' });
    await Mutha.create({
      name: 'Society A', leaderId: leaderA._id, memberIds: [], inviteCode: 'SOCA010',
      districtFederationId: districtA._id, affiliationStatus: 'affiliated',
    });
    const leaderB = await User.create({ name: 'LB', phone: '9970100012', passwordHash: 'x', role: 'mutha_leader' });
    await Mutha.create({
      name: 'Society B', leaderId: leaderB._id, memberIds: [], inviteCode: 'SOCB010',
      districtFederationId: districtB._id, affiliationStatus: 'affiliated',
    });

    const { agent } = await loginAs('federation_district_admin', '9970100013', districtA._id.toString());
    const res = await agent.get('/api/federation/me');
    expect(res.status).toBe(200);
    expect(res.body.counts.societies).toBe(1);
    expect(res.body.societies[0].name).toBe('Society A');
  });

  it("a state admin's dashboard rolls up every district under it", async () => {
    const state = await makeStateFederation('AP/COOP/STATE/T014');
    const districtA = await makeDistrictFederation(state._id.toString(), 'Nellore', 'AP/COOP/DIST/T014A');
    const districtB = await makeDistrictFederation(state._id.toString(), 'Kadapa', 'AP/COOP/DIST/T014B');

    const leaderA = await User.create({ name: 'LA2', phone: '9970100015', passwordHash: 'x', role: 'mutha_leader' });
    await Mutha.create({
      name: 'Society C', leaderId: leaderA._id, memberIds: [], inviteCode: 'SOCC014',
      districtFederationId: districtA._id, affiliationStatus: 'affiliated',
    });
    const leaderB = await User.create({ name: 'LB2', phone: '9970100016', passwordHash: 'x', role: 'mutha_leader' });
    await Mutha.create({
      name: 'Society D', leaderId: leaderB._id, memberIds: [], inviteCode: 'SOCD014',
      districtFederationId: districtB._id, affiliationStatus: 'affiliated',
    });

    const { agent } = await loginAs('federation_state_admin', '9970100017', state._id.toString());
    const res = await agent.get('/api/federation/me');
    expect(res.status).toBe(200);
    expect(res.body.counts.societies).toBe(2);
    expect(res.body.districts).toHaveLength(2);
  });

  it('404s an account with no federationId assigned', async () => {
    const { agent } = await loginAs('federation_district_admin', '9970100018');
    const res = await agent.get('/api/federation/me');
    expect(res.status).toBe(404);
  });
});

describe('society affiliation lifecycle', () => {
  it('leader requests affiliation, district admin approves — society becomes affiliated', async () => {
    const state = await makeStateFederation('AP/COOP/STATE/T020');
    const district = await makeDistrictFederation(state._id.toString(), 'Eluru', 'AP/COOP/DIST/T020');
    const { agent: leaderAgent, user: leader } = await loginAs('mutha_leader', '9970100021');
    const mutha = await Mutha.create({ name: 'Pending Society', leaderId: leader._id, memberIds: [], inviteCode: 'PEND020' });

    const reqRes = await leaderAgent.post('/api/mutha/affiliation-request').send({
      districtFederationId: district._id.toString(),
      societyRegistrationNumber: 'SOC/REG/020',
      registeredUnderAct: 'AP Cooperative Societies Act 1964',
    });
    expect(reqRes.status).toBe(200);
    expect(reqRes.body.mutha.affiliationStatus).toBe('pending');

    const { agent: districtAgent } = await loginAs('federation_district_admin', '9970100022', district._id.toString());
    const listRes = await districtAgent.get('/api/federation/affiliation-requests');
    expect(listRes.body.requests).toHaveLength(1);

    const decideRes = await districtAgent.patch(`/api/federation/affiliation-requests/${mutha._id}/decide`).send({ approve: true });
    expect(decideRes.status).toBe(200);
    expect(decideRes.body.mutha.affiliationStatus).toBe('affiliated');
  });

  it("a district admin cannot decide another district's affiliation request (IDOR guard)", async () => {
    const state = await makeStateFederation('AP/COOP/STATE/T023');
    const districtA = await makeDistrictFederation(state._id.toString(), 'Tirupati', 'AP/COOP/DIST/T023A');
    const districtB = await makeDistrictFederation(state._id.toString(), 'Anantapur', 'AP/COOP/DIST/T023B');
    const leader = await User.create({ name: 'L', phone: '9970100024', passwordHash: 'x', role: 'mutha_leader' });
    const mutha = await Mutha.create({
      name: 'Society E', leaderId: leader._id, memberIds: [], inviteCode: 'SOCE023',
      districtFederationId: districtA._id, affiliationStatus: 'pending',
    });

    const { agent: wrongDistrictAgent } = await loginAs('federation_district_admin', '9970100025', districtB._id.toString());
    const res = await wrongDistrictAgent.patch(`/api/federation/affiliation-requests/${mutha._id}/decide`).send({ approve: true });
    expect(res.status).toBe(404);
  });

  it('district admin suspends an affiliated society', async () => {
    const state = await makeStateFederation('AP/COOP/STATE/T026');
    const district = await makeDistrictFederation(state._id.toString(), 'Srikakulam', 'AP/COOP/DIST/T026');
    const leader = await User.create({ name: 'L2', phone: '9970100027', passwordHash: 'x', role: 'mutha_leader' });
    const mutha = await Mutha.create({
      name: 'Society F', leaderId: leader._id, memberIds: [], inviteCode: 'SOCF026',
      districtFederationId: district._id, affiliationStatus: 'affiliated',
    });

    const { agent } = await loginAs('federation_district_admin', '9970100028', district._id.toString());
    const res = await agent.patch(`/api/federation/societies/${mutha._id}/suspend`);
    expect(res.status).toBe(200);
    expect(res.body.mutha.affiliationStatus).toBe('suspended');
  });
});

describe('bye-law bounds enforcement', () => {
  it("rejects a leader's bye-law rate above their affiliated district federation's cap", async () => {
    const state = await makeStateFederation('AP/COOP/STATE/T030');
    const district = await makeDistrictFederation(state._id.toString(), 'Kakinada', 'AP/COOP/DIST/T030', 8, 3);
    const { agent, user: leader } = await loginAs('mutha_leader', '9970100031');
    await Mutha.create({
      name: 'Bounded Society', leaderId: leader._id, memberIds: [], inviteCode: 'BOUND030',
      districtFederationId: district._id, affiliationStatus: 'affiliated',
    });

    const res = await agent.patch('/api/governance/bye-laws').send({ commissionRatePct: 12, welfareDeductionRatePct: 2 });
    expect(res.status).toBe(400);
  });

  it('allows a rate within the cap', async () => {
    const state = await makeStateFederation('AP/COOP/STATE/T033');
    const district = await makeDistrictFederation(state._id.toString(), 'Rajahmundry', 'AP/COOP/DIST/T033', 8, 3);
    const { agent, user: leader } = await loginAs('mutha_leader', '9970100034');
    await Mutha.create({
      name: 'Fine Society', leaderId: leader._id, memberIds: [], inviteCode: 'FINE033',
      districtFederationId: district._id, affiliationStatus: 'affiliated',
    });

    const res = await agent.patch('/api/governance/bye-laws').send({ commissionRatePct: 5, welfareDeductionRatePct: 2 });
    expect(res.status).toBe(200);
    expect(res.body.mutha.commissionRatePct).toBe(5);
  });

  it('an unaffiliated society has no federation-imposed ceiling', async () => {
    const { agent, user: leader } = await loginAs('mutha_leader', '9970100035');
    await Mutha.create({ name: 'Free Society', leaderId: leader._id, memberIds: [], inviteCode: 'FREE035' });

    const res = await agent.patch('/api/governance/bye-laws').send({ commissionRatePct: 50, welfareDeductionRatePct: 20 });
    expect(res.status).toBe(200);
  });
});
