import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeGroup(leaderPhone: string, inviteCode: string) {
  const { agent, user: leader } = await loginAs('mutha_leader', leaderPhone);
  const { user: member } = await loginAs('mutha_member', `${leaderPhone.slice(0, -1)}9`);
  const mutha = await Mutha.create({
    name: 'Group',
    leaderId: leader._id,
    memberIds: [member._id],
    inviteCode,
  });
  await HamaliProfile.create({
    userId: member._id,
    type: 'mutha_member',
    muthaId: mutha._id,
    availabilityStatus: 'online',
  });
  return { agent, leader, mutha, member };
}

describe('GET /api/mutha/me', () => {
  it("returns the leader's group with the invite code and each member's live status", async () => {
    const { agent, mutha, member } = await makeGroup('9860000001', 'GROUP01');

    const res = await agent.get('/api/mutha/me');
    expect(res.status).toBe(200);
    expect(res.body.mutha.inviteCode).toBe('GROUP01');
    expect(res.body.mutha._id).toBe(mutha._id.toString());
    expect(res.body.members).toEqual([
      expect.objectContaining({ _id: member._id.toString(), availabilityStatus: 'online' }),
    ]);
  });

  it('is forbidden for a non-leader role (mutha_member)', async () => {
    const { agent } = await loginAs('mutha_member', '9860000002');
    const res = await agent.get('/api/mutha/me');
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/mutha/members/:userId', () => {
  it('removes a member from the roster and deletes their mutha_member HamaliProfile', async () => {
    const { agent, mutha, member } = await makeGroup('9860000003', 'GROUP02');

    const res = await agent.delete(`/api/mutha/members/${member._id}`);
    expect(res.status).toBe(200);

    const updated = await Mutha.findById(mutha._id);
    expect(updated?.memberIds.map((id) => id.toString())).not.toContain(member._id.toString());

    const profile = await HamaliProfile.findOne({ userId: member._id });
    expect(profile).toBeNull();
  });

  it("404s trying to remove a user who isn't actually a member of the caller's Mutha (IDOR guard)", async () => {
    const { agent } = await makeGroup('9860000004', 'GROUP03');
    const outsider = await User.create({ name: 'X', phone: '9860009999', passwordHash: 'x', role: 'mutha_member' });

    const res = await agent.delete(`/api/mutha/members/${outsider._id}`);
    expect(res.status).toBe(404);
  });
});
