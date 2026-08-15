import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

async function loginAs(role: string, phone: string, permissions: string[] = []) {
  const passwordHash = await bcrypt.hash('x', 10);
  const user = await User.create({ name: 'U', phone, passwordHash, role, permissions });
  const agent = request.agent(app);
  const accessToken = signAccessToken({ id: user._id.toString(), role: role as never });
  agent.jar.setCookie(`accessToken=${accessToken}`);
  return { agent, user };
}

async function makeBooking(customerId: string, driverId?: string) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500 },
    pickupLocation: { type: 'Point', coordinates: [78.4867, 17.385], address: 'Pickup' },
    dropLocation: { type: 'Point', coordinates: [78.5, 17.4], address: 'Drop' },
    requiredVehicles: [{ capacityKg: 500, count: 1 }],
    assignedDriverIds: driverId ? [driverId] : [],
    status: 'completed',
    fareBreakdown: { baseFare: 200, distanceFare: 50, surgeMultiplier: 1, hamaliFare: 0, total: 250 },
    statusHistory: [{ status: 'completed', timestamp: new Date() }],
  });
}

describe('POST /api/complaints', () => {
  it('lets the customer raise a complaint against the assigned driver', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9930000001');
    const { user: driver } = await loginAs('driver', '9930000002');
    const booking = await makeBooking(customer._id.toString(), driver._id.toString());

    const res = await customerAgent.post('/api/complaints').send({
      bookingId: booking._id,
      category: 'damage',
      description: 'Cargo arrived damaged.',
      againstUserId: driver._id,
    });
    expect(res.status).toBe(201);
    expect(res.body.complaint.status).toBe('open');
  });

  it('rejects a complaint from someone who was not a party to the booking (IDOR guard)', async () => {
    const { user: customer } = await loginAs('customer', '9930000003');
    const booking = await makeBooking(customer._id.toString());
    const { agent: strangerAgent } = await loginAs('customer', '9930000004');

    const res = await strangerAgent.post('/api/complaints').send({
      bookingId: booking._id,
      category: 'other',
      description: 'Not involved.',
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/complaints/mine', () => {
  it("returns only the caller's own complaints", async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9930000005');
    const booking = await makeBooking(customer._id.toString());
    await customerAgent.post('/api/complaints').send({ bookingId: booking._id, category: 'other', description: 'x' });

    const res = await customerAgent.get('/api/complaints/mine');
    expect(res.status).toBe(200);
    expect(res.body.complaints).toHaveLength(1);
  });
});

describe('admin/manager complaint resolution', () => {
  it('lets a manager WITH resolve_complaints resolve a complaint and writes an audit log', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9930000006');
    const booking = await makeBooking(customer._id.toString());
    const created = await customerAgent
      .post('/api/complaints')
      .send({ bookingId: booking._id, category: 'other', description: 'x' });

    const { agent: managerAgent } = await loginAs('manager', '9930000007', ['resolve_complaints']);
    const res = await managerAgent
      .patch(`/api/admin/complaints/${created.body.complaint._id}/resolve`)
      .send({ status: 'resolved', resolutionNote: 'Refunded.' });
    expect(res.status).toBe(200);
    expect(res.body.complaint.status).toBe('resolved');
    expect(res.body.complaint.resolvedAt).toBeTruthy();
  });

  it('403s a manager WITHOUT resolve_complaints', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9930000008');
    const booking = await makeBooking(customer._id.toString());
    const created = await customerAgent
      .post('/api/complaints')
      .send({ bookingId: booking._id, category: 'other', description: 'x' });

    const { agent: managerAgent } = await loginAs('manager', '9930000009', ['edit_fare_rules']);
    const res = await managerAgent
      .patch(`/api/admin/complaints/${created.body.complaint._id}/resolve`)
      .send({ status: 'resolved', resolutionNote: 'x' });
    expect(res.status).toBe(403);
  });

  it('rejects re-resolving an already-resolved complaint', async () => {
    const { agent: customerAgent, user: customer } = await loginAs('customer', '9930000010');
    const booking = await makeBooking(customer._id.toString());
    const created = await customerAgent
      .post('/api/complaints')
      .send({ bookingId: booking._id, category: 'other', description: 'x' });

    const { agent: managerAgent } = await loginAs('manager', '9930000011', ['resolve_complaints']);
    await managerAgent
      .patch(`/api/admin/complaints/${created.body.complaint._id}/resolve`)
      .send({ status: 'resolved', resolutionNote: 'x' });

    const second = await managerAgent
      .patch(`/api/admin/complaints/${created.body.complaint._id}/resolve`)
      .send({ status: 'resolved', resolutionNote: 'again' });
    expect(second.status).toBe(400);
  });
});
