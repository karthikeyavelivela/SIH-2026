import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Feedback } from '../src/models/Feedback';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

describe('product feedback', () => {
  it('accepts feedback from any role and shows the submitter its status', async () => {
    const { agent } = await loginAs('driver', '9980000001');

    const sent = await agent
      .post('/api/feedback')
      .send({ category: 'bug', message: 'The earnings screen shows last week when I open it.' });
    expect(sent.status).toBe(201);

    const mine = await agent.get('/api/feedback/mine');
    expect(mine.body.feedback).toHaveLength(1);
    // Submitting into a void is what makes people stop submitting.
    expect(mine.body.feedback[0].status).toBe('new');
  });

  it('requires a service name when someone asks for a service we do not offer', async () => {
    const { agent } = await loginAs('customer', '9980000002');

    const missing = await agent
      .post('/api/feedback')
      .send({ category: 'service_request', message: 'You should offer this.' });
    expect(missing.status).toBe(400);

    const named = await agent.post('/api/feedback').send({
      category: 'service_request',
      message: 'Nobody on FYRO does this.',
      requestedService: 'Pest control',
    });
    expect(named.status).toBe(201);
  });

  it('counts requested services so unmet demand becomes visible', async () => {
    const { agent: a } = await loginAs('customer', '9980000003');
    const { agent: b } = await loginAs('customer', '9980000004');
    const { agent: c } = await loginAs('customer', '9980000005');

    const posts = await Promise.all([
      a.post('/api/feedback').send({ category: 'service_request', message: 'Cockroaches every monsoon.', requestedService: 'Pest control' }),
      b.post('/api/feedback').send({ category: 'service_request', message: 'Need this for my kitchen.', requestedService: 'pest control' }),
      c.post('/api/feedback').send({ category: 'service_request', message: 'Want cameras at my gate.', requestedService: 'CCTV fitting' }),
    ]);
    expect(posts.map((p) => p.status)).toEqual([201, 201, 201]);

    const { agent: admin } = await loginAs('admin', '9980000006');
    const res = await admin.get('/api/feedback/demand');

    expect(res.status).toBe(200);
    // Case-insensitive, so two spellings of one trade are one demand signal.
    expect(res.body.demand[0].count).toBe(2);
    expect(res.body.demand[0].label.toLowerCase()).toBe('pest control');
    expect(res.body.demand[1].count).toBe(1);
  });

  it('leaves out requests for services that already exist', async () => {
    await ServiceCategory.create({
      name: 'Electrician',
      slug: 'electrician',
      icon: 'PowerIcon',
      accentColor: 'primary',
      pricingUnit: 'per_hour',
      dispatchType: 'hamali',
      defaultDurationMinutes: 60,
      active: true,
    });
    const { agent } = await loginAs('customer', '9980000007');
    await agent
      .post('/api/feedback')
      .send({ category: 'service_request', message: 'I could not find anyone for this.', requestedService: 'Electrician' });

    const { agent: admin } = await loginAs('admin', '9980000008');
    const res = await admin.get('/api/feedback/demand');

    // Asking for something already on the list is a discovery problem, not a
    // catalogue gap — counting it would drown out the real signal.
    expect(res.body.demand).toHaveLength(0);
  });

  it('keeps one person\'s feedback out of another\'s list', async () => {
    const { agent: a } = await loginAs('customer', '9980000009');
    await a.post('/api/feedback').send({ category: 'other', message: 'SECRET-FEEDBACK-TEXT' });

    const { agent: b } = await loginAs('customer', '9980000010');
    const mine = await b.get('/api/feedback/mine');

    expect(JSON.stringify(mine.body)).not.toContain('SECRET-FEEDBACK-TEXT');
  });

  it('only admin and manager can read everyone\'s feedback or the demand list', async () => {
    const { agent } = await loginAs('customer', '9980000011');
    expect((await agent.get('/api/feedback')).status).toBe(403);
    expect((await agent.get('/api/feedback/demand')).status).toBe(403);
  });

  it('an admin can move a submission through its statuses', async () => {
    const { agent } = await loginAs('customer', '9980000012');
    const sent = await agent.post('/api/feedback').send({ category: 'feature_request', message: 'Add dark mode.' });

    const { agent: admin } = await loginAs('admin', '9980000013');
    const res = await admin
      .patch(`/api/feedback/${sent.body.feedback._id}`)
      .send({ status: 'planned', adminNote: 'On the list for next release.' });

    expect(res.status).toBe(200);
    const row = await Feedback.findById(sent.body.feedback._id);
    expect(row?.status).toBe('planned');
    expect(row?.handledByUserId).toBeTruthy();
  });
});
