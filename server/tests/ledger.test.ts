import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { LedgerEntry } from '../src/models/LedgerEntry';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, permissions: string[] = []) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role, permissions });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function seedEntries() {
  await LedgerEntry.create([
    { type: 'revenue', entityType: 'Booking', entityId: '507f1f77bcf86cd799439011', amount: 500, description: 'Trip fare', timestamp: new Date() },
    { type: 'payout', entityType: 'Payout', entityId: '507f1f77bcf86cd799439012', amount: 200, description: 'Driver payout', timestamp: new Date() },
    { type: 'fee', entityType: 'Booking', entityId: '507f1f77bcf86cd799439013', amount: 25, description: 'Platform fee', timestamp: new Date() },
  ]);
}

describe('GET /api/admin/ledger', () => {
  it('admin-only — a manager (even with other permissions) is blocked, no view_ledger permission slot exists', async () => {
    const { agent } = await loginAs('manager', '9990000001', ['view_analytics', 'edit_fare_rules']);
    const res = await agent.get('/api/admin/ledger');
    expect(res.status).toBe(403);
  });

  it('returns paginated entries with a real per-type summary aggregation', async () => {
    await seedEntries();
    const { agent } = await loginAs('admin', '9990000002');
    const res = await agent.get('/api/admin/ledger');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.summary.revenue).toBe(500);
    expect(res.body.summary.payout).toBe(200);
    expect(res.body.summary.fee).toBe(25);
    expect(res.body.summary.refund).toBe(0);
  });

  it('filters by type', async () => {
    await seedEntries();
    const { agent } = await loginAs('admin', '9990000003');
    const res = await agent.get('/api/admin/ledger?type=payout');
    expect(res.status).toBe(200);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].type).toBe('payout');
  });
});

describe('GET /api/admin/ledger/export', () => {
  it('returns a real CSV with a header row and one row per entry', async () => {
    await seedEntries();
    const { agent } = await loginAs('admin', '9990000004');
    const res = await agent.get('/api/admin/ledger/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    const lines = res.text.trim().split('\n');
    expect(lines.length).toBe(4); // header + 3 entries
  });
});
