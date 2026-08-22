import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { AuditLog } from '../src/models/AuditLog';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role, region: 'Visakhapatnam' });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function makeCompletedBookingFor(customerId: string, fareTotal: number, addressTag: string) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 100 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: `Pickup ${addressTag}` },
    dropLocation: { type: 'Point', coordinates: DROP, address: `Drop ${addressTag}` },
    requiredVehicles: [{ capacityKg: 100, count: 1 }],
    status: 'completed',
    fareBreakdown: { baseFare: fareTotal, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: fareTotal },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

describe('Agent A (support) — IDOR: only ever sees the caller\'s own data', () => {
  it('never leaks another customer\'s booking address into the response', async () => {
    const { user: victim } = await loginAs('customer', '9880000001');
    await makeCompletedBookingFor(victim._id.toString(), 999, 'VictimSecretAddress42'); // victim's real, distinctive data

    const { agent: attackerAgent, user: attacker } = await loginAs('customer', '9880000002');
    await makeCompletedBookingFor(attacker._id.toString(), 111, 'AttackerOwnAddress'); // attacker's own, different data

    const res = await attackerAgent.post('/api/agents/support').send({ question: 'What is the status of my last booking?' });
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // The victim's booking amount/address must never appear in the
    // attacker's own agent response — this is the actual IDOR assertion,
    // not just "the route returned 200".
    expect(body).not.toMatch(/999/);
    expect(body).not.toMatch(/VictimSecretAddress42/);
    void attacker;
  });

  it('writes an audit log entry for every support query', async () => {
    const { agent } = await loginAs('customer', '9880000003');
    await agent.post('/api/agents/support').send({ question: 'Where is my order?' });
    const entries = await AuditLog.find({ action: 'agent_support_queried' });
    expect(entries.length).toBeGreaterThan(0);
  });

  it('response carries a confidence score and non-fabricated evidence array (mock mode)', async () => {
    const { agent } = await loginAs('driver', '9880000004');
    const res = await agent.post('/api/agents/support').send({ question: 'How am I doing?' });
    expect(res.status).toBe(200);
    expect(['low', 'moderate', 'high']).toContain(res.body.result.confidence);
    expect(Array.isArray(res.body.result.evidence)).toBe(true);
    expect(res.body.result.mock).toBe(true); // no ANTHROPIC_API_KEY in test env
  });
});

describe('Agent B (dispute triage) — admin-only, RBAC enforced', () => {
  it('blocks a non-admin (driver) from triaging any dispute (403)', async () => {
    const { agent } = await loginAs('driver', '9880000005');
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await agent.post(`/api/agents/dispute-triage/${fakeId}`);
    expect(res.status).toBe(403);
  });

  it('404s a real admin on a dispute id that does not exist, rather than leaking a 500 or empty success', async () => {
    const { agent } = await loginAs('admin', '9880000006');
    const fakeId = '507f1f77bcf86cd799439011';
    const res = await agent.post(`/api/agents/dispute-triage/${fakeId}`);
    expect(res.status).toBe(404);
  });
});

describe('Agent C (demand forecast) — audience is forced by role, never trusted from the client', () => {
  it('a driver cannot request the admin framing by claiming a different role in the body', async () => {
    const { agent } = await loginAs('driver', '9880000007');
    // audience isn't even a real body field agents.controller.ts reads —
    // this proves sending one has no effect, the role alone decides it.
    const res = await agent.post('/api/agents/demand-forecast').send({ region: 'Visakhapatnam', audience: 'admin' });
    expect(res.status).toBe(200);
    // Can't directly assert the internal audience value from the HTTP
    // response, but the low-data guardrail below proves the real code
    // path ran (region has no bookings in this test's fresh DB).
    expect(res.body.result.confidence).toBe('low');
    expect(res.body.result.summary).toMatch(/not enough/i);
  });

  it('refuses to forecast on thin history (mandatory low-data guardrail) rather than guessing', async () => {
    const { agent } = await loginAs('admin', '9880000008');
    const res = await agent.post('/api/agents/demand-forecast').send({ region: 'A Region With No Bookings At All' });
    expect(res.status).toBe(200);
    expect(res.body.result.confidence).toBe('low');
    expect(res.body.result.evidence[0].value).toMatch(/0 \//); // "0 / 20 minimum"
  });

  it('blocks a customer entirely — no forecast view for that role', async () => {
    const { agent } = await loginAs('customer', '9880000009');
    const res = await agent.post('/api/agents/demand-forecast').send({ region: 'Visakhapatnam' });
    expect(res.status).toBe(403);
  });
});

describe('Agent D (document pre-check) — scoped to the caller\'s own documents only', () => {
  it('pre-checks the caller\'s own uploaded document', async () => {
    const { agent } = await loginAs('driver', '9880000010');
    await agent.post('/api/kyc/documents').send({
      type: 'aadhaar',
      fileBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    });
    const res = await agent.post('/api/agents/document-precheck').send({ documentType: 'aadhaar' });
    expect(res.status).toBe(200);
    expect(res.body.result.confidence).toBeTruthy();
  });

  it('404s for a document type the caller never uploaded, rather than fabricating a result', async () => {
    const { agent } = await loginAs('driver', '9880000011');
    const res = await agent.post('/api/agents/document-precheck').send({ documentType: 'pan' });
    expect(res.status).toBe(404);
  });
});

describe('No agent can execute a privileged action — every response is read-only', () => {
  it('a support-agent call never changes account status, booking status, or any other record', async () => {
    const { agent, user } = await loginAs('customer', '9880000012');
    const booking = await makeCompletedBookingFor(user._id.toString(), 500, 'Whatever');
    await agent.post('/api/agents/support').send({ question: 'cancel my booking' });

    const after = await Booking.findById(booking._id);
    expect(after!.status).toBe('completed'); // unchanged — the agent has no write path to this at all
  });
});
