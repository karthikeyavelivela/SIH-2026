import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { Mutha } from '../src/models/Mutha';
import { User } from '../src/models/User';

describe('auth flow', () => {
  it('signs up a customer, logs in, reads /me, refreshes, logs out', async () => {
    const agent = request.agent(app);

    const signup = await agent.post('/api/auth/signup/customer').send({
      name: 'Asha',
      phone: '9000000001',
      password: 'Passw0rd!',
    });
    expect(signup.status).toBe(201);
    expect(signup.body.user.passwordHash).toBeUndefined();

    const me1 = await agent.get('/api/auth/me');
    expect(me1.status).toBe(200);
    expect(me1.body.user.role).toBe('customer');

    const refresh = await agent.post('/api/auth/refresh');
    expect(refresh.status).toBe(200);

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(200);

    const meAfterLogout = await agent.get('/api/auth/me');
    expect(meAfterLogout.status).toBe(401);
  });

  it('rejects duplicate phone signup', async () => {
    await request(app).post('/api/auth/signup/customer').send({
      name: 'A',
      phone: '9000000002',
      password: 'Passw0rd!',
    });
    const dup = await request(app).post('/api/auth/signup/customer').send({
      name: 'B',
      phone: '9000000002',
      password: 'Passw0rd!',
    });
    expect(dup.status).toBe(409);
  });

  it('signs up a driver with vehicle basics', async () => {
    const res = await request(app).post('/api/auth/signup/driver').send({
      name: 'Ravi',
      phone: '9000000003',
      password: 'Passw0rd!',
      vehicleType: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP01AB1234',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('driver');
  });

  it('signs up a hamali leader, creating a Mutha with an invite code', async () => {
    const res = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Leader L',
      phone: '9000000004',
      password: 'Passw0rd!',
      joinType: 'leader',
      muthaName: 'Vizag Loaders',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('mutha_leader');
    expect(res.body.mutha.inviteCode).toBeDefined();
  });

  it('signs up a hamali member via a valid invite code, rejects an invalid one', async () => {
    const leaderRes = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Leader L2',
      phone: '9000000005',
      password: 'Passw0rd!',
      joinType: 'leader',
      muthaName: 'Vijayawada Loaders',
    });
    const inviteCode = leaderRes.body.mutha.inviteCode;

    const goodMember = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Member M',
      phone: '9000000006',
      password: 'Passw0rd!',
      joinType: 'member',
      inviteCode,
    });
    expect(goodMember.status).toBe(201);
    expect(goodMember.body.user.role).toBe('mutha_member');

    const badMember = await request(app).post('/api/auth/signup/hamali').send({
      name: 'Member N',
      phone: '9000000007',
      password: 'Passw0rd!',
      joinType: 'member',
      inviteCode: 'NOTAREALCODE',
    });
    expect(badMember.status).toBe(400);

    const mutha = await Mutha.findOne({ inviteCode });
    expect(mutha?.memberIds.length).toBe(1);
  });

  it('rate limits signup after 5 rapid attempts from the same IP', async () => {
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/auth/signup/customer')
        .send({ name: 'x', phone: `92000000${i}`, password: 'Passw0rd!' });
    }
    const sixth = await request(app)
      .post('/api/auth/signup/customer')
      .send({ name: 'x', phone: '9200000009', password: 'Passw0rd!' });
    expect(sixth.status).toBe(429);
  });

  it('rejects a duplicate vehicle registration number with 409 and rolls back the orphaned User', async () => {
    const first = await request(app).post('/api/auth/signup/driver').send({
      name: 'Driver A',
      phone: '9300000001',
      password: 'Passw0rd!',
      vehicleType: 'mini_truck',
      capacityKg: 1000,
      registrationNumber: 'AP09XY9999',
    });
    expect(first.status).toBe(201);

    // registrationNumber has no pre-check (unlike phone) — this is the gap
    // rethrowAsConflict + the compensating User rollback exist to close.
    const second = await request(app).post('/api/auth/signup/driver').send({
      name: 'Driver B',
      phone: '9300000002',
      password: 'Passw0rd!',
      vehicleType: 'mini_truck',
      capacityKg: 1200,
      registrationNumber: 'AP09XY9999',
    });
    expect(second.status).toBe(409);

    // The User created for the failed second signup must have been rolled
    // back — otherwise phone 9300000002 would be permanently stuck
    // "registered" with no working Vehicle behind it, unable to ever retry.
    const orphan = await User.findOne({ phone: '9300000002' });
    expect(orphan).toBeNull();
  });
});
