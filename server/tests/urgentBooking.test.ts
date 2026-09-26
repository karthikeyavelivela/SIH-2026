import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';
import { FareRule } from '../src/models/FareRule';
import { signAccessToken } from '../src/services/token.service';
import * as emitters from '../src/realtime/emitters';
import {
  startHamaliOffers,
  respondToHamaliOffer,
  _offerPlanFor,
  _currentOfferFor,
  _clearAllOffersForTests,
} from '../src/realtime/offerEngine';

/*
 * P1.4 — urgent booking: first in line, widening rings, a shorter countdown,
 * no extra fee.
 */

const PICKUP: [number, number] = [78.4867, 17.385];
let seq = 0;

async function agentFor(role: string) {
  seq += 1;
  const user = await User.create({ name: `U${seq}`, phone: `98880${String(seq).padStart(5, '0')}`, passwordHash: 'x', role });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

/** An online solo worker `dLng` degrees east of the pickup (0.01° ≈ 1.06 km here). */
async function workerAt(dLng: number) {
  const { agent, user } = await agentFor('hamali_solo');
  await HamaliProfile.create({
    userId: user._id,
    type: 'solo',
    workerKind: 'hamali',
    skills: [],
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: [PICKUP[0] + dLng, PICKUP[1]] },
  });
  return { agent, user };
}

async function openJob(urgent: boolean) {
  const { user: customer } = await agentFor('customer');
  return Booking.create({
    customerId: customer._id,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'P' },
    dropLocation: { type: 'Point', coordinates: PICKUP, address: 'P' },
    requiredHamaliCount: 1,
    status: 'searching',
    urgent,
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 330, workerRate: 300, serviceFeePct: 10, serviceFee: 30 },
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
  });
}

afterEach(() => _clearAllOffersForTests());

describe('offer plan', () => {
  it('urgent: 3 → 6 → 10 km then the ordinary radius, with a shorter countdown', () => {
    expect(_offerPlanFor(true)).toEqual({ radii: [3, 6, 10, 25], timeoutMs: 12000 });
    expect(_offerPlanFor(false)).toEqual({ radii: [25], timeoutMs: 20000 });
  });
});

describe('urgent offers widen ring by ring', () => {
  it('offers the 2 km worker first, then jumps to the 10 km ring for the 8 km worker, then the ordinary radius', async () => {
    const near = await workerAt(0.02); // ~2 km
    const mid = await workerAt(0.075); // ~8 km
    const far = await workerAt(0.15); // ~16 km
    const booking = await openJob(true);

    const offers: { userId: string; urgent?: boolean; expiresAt: number }[] = [];
    const spy = jest.spyOn(emitters, 'emitBookingOffer').mockImplementation((userId, payload) => {
      offers.push({ userId, urgent: payload.urgent, expiresAt: payload.expiresAt });
    });
    try {
      const before = Date.now();
      await startHamaliOffers(booking);
      expect(offers.map((o) => o.userId)).toEqual([near.user._id.toString()]);
      expect(offers[0].urgent).toBe(true);
      expect(offers[0].expiresAt - before).toBeLessThanOrEqual(12_500);
      expect(_currentOfferFor(booking._id.toString(), 'hamali')).toMatchObject({ ring: 0, radiusKm: 3 });

      await respondToHamaliOffer(booking._id.toString(), near.user._id.toString(), false);
      // Nobody new within 6 km, so the search goes straight on to 10 km.
      expect(offers.map((o) => o.userId)).toEqual([near.user._id.toString(), mid.user._id.toString()]);
      expect(_currentOfferFor(booking._id.toString(), 'hamali')).toMatchObject({ ring: 2, radiusKm: 10 });

      await respondToHamaliOffer(booking._id.toString(), mid.user._id.toString(), false);
      expect(offers.map((o) => o.userId)).toEqual([
        near.user._id.toString(),
        mid.user._id.toString(),
        far.user._id.toString(),
      ]);
      // Nobody is ever offered twice.
      expect(new Set(offers.map((o) => o.userId)).size).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });

  it('an ordinary booking searches the ordinary radius at once, with the ordinary countdown', async () => {
    const near = await workerAt(0.02);
    await workerAt(0.15);
    const booking = await openJob(false);
    const offers: { userId: string; urgent?: boolean; expiresAt: number }[] = [];
    const spy = jest.spyOn(emitters, 'emitBookingOffer').mockImplementation((userId, payload) => {
      offers.push({ userId, urgent: payload.urgent, expiresAt: payload.expiresAt });
    });
    try {
      const before = Date.now();
      await startHamaliOffers(booking);
      expect(offers[0]).toMatchObject({ userId: near.user._id.toString(), urgent: false });
      expect(offers[0].expiresAt - before).toBeGreaterThan(19_000);
      expect(_currentOfferFor(booking._id.toString(), 'hamali')).toMatchObject({ ring: 0, radiusKm: 25 });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('feeds and booking', () => {
  it('urgent jobs come first in a worker feed', async () => {
    const worker = await workerAt(0.01);
    const ordinary = await openJob(false);
    const urgent = await openJob(true);
    const res = await worker.agent.get('/api/requests');
    expect(res.status).toBe(200);
    expect(res.body.requests.map((b: { _id: string }) => b._id)).toEqual([urgent._id.toString(), ordinary._id.toString()]);
    expect(res.body.requests[0].urgent).toBe(true);
  });

  it('a customer can book urgently at no extra cost, but not urgently-and-later', async () => {
    const { agent: customer } = await agentFor('customer');
    const { user: admin } = await agentFor('admin');
    await FareRule.create({
      region: 'Hyderabad',
      category: 'hamali',
      baseFare: 300,
      perKmRate: 0,
      minimumFare: 300,
      surgeMultiplier: 1,
      setByAdminId: admin._id,
      active: true,
    });
    const body = {
      type: 'hamali',
      region: 'Hyderabad',
      cargoDetails: { weightKg: 0 },
      pickupLocation: { coordinates: PICKUP, address: 'P' },
      dropLocation: { coordinates: PICKUP, address: 'P' },
      requiredHamaliCount: 1,
    };
    const normal = await customer.post('/api/bookings').send(body);
    const urgent = await customer.post('/api/bookings').send({ ...body, urgent: true });
    expect(urgent.status).toBe(201);
    expect(urgent.body.booking.urgent).toBe(true);
    // No extra fee: the same price either way.
    expect(urgent.body.booking.fareBreakdown.total).toBe(normal.body.booking.fareBreakdown.total);

    const later = await customer
      .post('/api/bookings')
      .send({ ...body, urgent: true, scheduledFor: new Date(Date.now() + 2 * 3600_000).toISOString() });
    expect(later.status).toBe(400);
    expect(later.body.error).toMatch(/urgent booking is for now/);
  });
});
