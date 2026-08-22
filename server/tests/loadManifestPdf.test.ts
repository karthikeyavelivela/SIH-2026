import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];

async function loginAs(role: string, phone: string) {
  const passwordHash = await bcrypt.hash('Passw0rd!', 12);
  const user = await User.create({ name: 'U', phone, passwordHash, role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function makeAssignedBooking(driverId: string, customerId: string) {
  return Booking.create({
    customerId,
    type: 'truck',
    cargoDetails: { weightKg: 500, description: 'Machine parts' },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'Factory Gate 3' },
    dropLocation: { type: 'Point', coordinates: DROP, address: 'Warehouse Dock 7' },
    requiredVehicles: [{ capacityKg: 1000, count: 1 }],
    assignedDriverIds: [driverId],
    status: 'in_progress',
    distanceKm: 12.4,
    fareBreakdown: { baseFare: 150, distanceFare: 200, surgeMultiplier: 1, hamaliFare: 0, total: 350 },
    statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
  });
}

describe('Phase 6 — Bill of Lading PDF', () => {
  it('a pending (unsigned) manifest still renders a PDF, watermarked as a draft', async () => {
    const { agent, user: driver } = await loginAs('driver', '9840000001');
    const customer = await User.create({ name: 'C', phone: '9840000002', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());

    // Create-on-first-read, same as the manifest screen itself.
    await agent.get(`/api/load-manifests/${booking._id}`);

    const res = await agent.get(`/api/load-manifests/${booking._id}/pdf`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length).toBeGreaterThan(500); // a real rendered PDF, not an empty stub
    expect(res.body.slice(0, 4).toString('latin1')).toBe('%PDF'); // real PDF magic bytes
  });

  it('a driver who is not assigned to the booking cannot download its manifest PDF', async () => {
    const { agent: assignedAgent, user: driver } = await loginAs('driver', '9840000003');
    const { agent: strangerAgent } = await loginAs('driver', '9840000004');
    const customer = await User.create({ name: 'C2', phone: '9840000005', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());
    await assignedAgent.get(`/api/load-manifests/${booking._id}`);

    const res = await strangerAgent.get(`/api/load-manifests/${booking._id}/pdf`);
    expect(res.status).toBe(403);
  });

  it('404s if the manifest was never created (no prior GET to create-on-first-read)', async () => {
    const { agent, user: driver } = await loginAs('driver', '9840000006');
    const customer = await User.create({ name: 'C3', phone: '9840000007', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());

    const res = await agent.get(`/api/load-manifests/${booking._id}/pdf`);
    expect(res.status).toBe(404);
  });
});
