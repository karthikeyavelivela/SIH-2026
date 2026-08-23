import './setup';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Booking } from '../src/models/Booking';
import { signAccessToken } from '../src/services/token.service';

const PICKUP: [number, number] = [78.4867, 17.385];
const DROP: [number, number] = [78.5, 17.4];
// Smallest valid 1x1 PNG, base64 — same fixture used elsewhere in this
// suite (e.g. kycDocument tests) for a real-but-tiny signature image.
const TINY_PNG_B64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

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
    fareBreakdown: { baseFare: 150, distanceFare: 200, surgeMultiplier: 1, hamaliFare: 0, total: 350 },
    statusHistory: [{ status: 'in_progress', timestamp: new Date() }],
  });
}

describe('GET /api/load-manifests/:bookingId — create-on-first-read', () => {
  it('creates a pending manifest seeded from the booking cargoDetails on first read, then returns the same doc on a second read', async () => {
    const { agent, user: driver } = await loginAs('driver', '9994000001');
    const customer = await User.create({ name: 'C', phone: '9994000002', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());

    const first = await agent.get(`/api/load-manifests/${booking._id}`);
    expect(first.status).toBe(200);
    expect(first.body.manifest.status).toBe('pending');

    const second = await agent.get(`/api/load-manifests/${booking._id}`);
    expect(second.status).toBe(200);
    expect(second.body.manifest._id).toBe(first.body.manifest._id);
  });

  it('403s a driver who is not the one assigned to the booking (IDOR guard)', async () => {
    const { user: driver } = await loginAs('driver', '9994000003');
    const customer = await User.create({ name: 'C2', phone: '9994000004', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());

    const { agent: strangerAgent } = await loginAs('driver', '9994000005');
    const res = await strangerAgent.get(`/api/load-manifests/${booking._id}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/load-manifests/:bookingId/sign — one-way immutability', () => {
  it('signs a pending manifest, setting status/signedAt/signatureImageUrl together', async () => {
    const { agent, user: driver } = await loginAs('driver', '9994000006');
    const customer = await User.create({ name: 'C3', phone: '9994000007', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());
    await agent.get(`/api/load-manifests/${booking._id}`);

    const res = await agent.post(`/api/load-manifests/${booking._id}/sign`).send({ signatureImageBase64: TINY_PNG_B64 });
    expect(res.status).toBe(200);
    expect(res.body.manifest.status).toBe('signed');
    expect(res.body.manifest.signedAt).toBeTruthy();
    expect(res.body.manifest.signatureImageUrl).toBeTruthy();
  });

  it('rejects re-signing an already-signed manifest with 409 (real legal-artifact immutability, not a soft rule)', async () => {
    const { agent, user: driver } = await loginAs('driver', '9994000008');
    const customer = await User.create({ name: 'C4', phone: '9994000009', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());
    await agent.get(`/api/load-manifests/${booking._id}`);
    await agent.post(`/api/load-manifests/${booking._id}/sign`).send({ signatureImageBase64: TINY_PNG_B64 });

    const secondAttempt = await agent.post(`/api/load-manifests/${booking._id}/sign`).send({ signatureImageBase64: TINY_PNG_B64 });
    expect(secondAttempt.status).toBe(409);
  });

  it('rejects signing before the manifest has ever been created (GET first)', async () => {
    const { agent, user: driver } = await loginAs('driver', '9994000010');
    const customer = await User.create({ name: 'C5', phone: '9994000011', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());

    const res = await agent.post(`/api/load-manifests/${booking._id}/sign`).send({ signatureImageBase64: TINY_PNG_B64 });
    expect(res.status).toBe(404);
  });

  it('rejects a malformed (non data:image/png) signature payload', async () => {
    const { agent, user: driver } = await loginAs('driver', '9994000012');
    const customer = await User.create({ name: 'C6', phone: '9994000013', passwordHash: 'x', role: 'customer' });
    const booking = await makeAssignedBooking(driver._id.toString(), customer._id.toString());
    await agent.get(`/api/load-manifests/${booking._id}`);

    const res = await agent.post(`/api/load-manifests/${booking._id}/sign`).send({ signatureImageBase64: 'not-a-real-image-'.repeat(10) });
    expect(res.status).toBe(400);
  });
});
