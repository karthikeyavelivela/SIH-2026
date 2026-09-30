import './setup';

// Every `new Redis(url)` in the code under test is an in-memory fake; two
// instances with the same URL share data, which is what two app instances on
// one Redis look like.
jest.mock('ioredis', () => {
  const Mock = jest.requireActual('ioredis-mock');
  // Real ioredis has `call(command, ...args)`, which rate-limit-redis uses;
  // the fake does not, so give it the same behaviour.
  if (!Mock.prototype.call) {
    Mock.prototype.call = function call(this: Record<string, (...a: unknown[]) => unknown>, command: string, ...args: unknown[]) {
      return this[command.toLowerCase()](...args);
    };
  }
  return Mock;
});

const mockUpsert = jest.fn(async () => undefined);
const workerProcessors: ((job: { name: string }) => Promise<void>)[] = [];
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ upsertJobScheduler: mockUpsert, close: jest.fn(async () => undefined) })),
  Worker: jest.fn().mockImplementation((_name: string, processor: (job: { name: string }) => Promise<void>) => {
    workerProcessors.push(processor);
    return { on: jest.fn(), close: jest.fn(async () => undefined) };
  }),
}));

import express from 'express';
import request from 'supertest';
import http from 'http';
import rateLimit from 'express-rate-limit';
import { env } from '../src/config/env';
import { app } from '../src/app';
import * as redisModule from '../src/infra/redis';
import { getRedis, redisEnabled, redisHealth, closeRedis } from '../src/infra/redis';
import { storeFor } from '../src/infra/limiterStore';
import { onSecondary } from '../src/infra/readPreference';
import { RECURRING_JOBS, processJob, startRecurringJobs, stopRecurringJobs } from '../src/infra/scheduler';
import { initRealtime } from '../src/realtime';
import * as contractService from '../src/services/contract.service';
import * as policeService from '../src/services/policeVerification.service';
import * as welfareService from '../src/services/welfarePool.service';
import * as scheduledBooking from '../src/services/scheduledBooking.service';
import * as incentives from '../src/services/scheduledIncentiveRunner.service';
import { User } from '../src/models/User';
import { HamaliProfile } from '../src/models/HamaliProfile';
import { Booking } from '../src/models/Booking';
import * as emitters from '../src/realtime/emitters';
import {
  startHamaliOffers,
  respondToHamaliOffer,
  _currentOfferFor,
  _clearAllOffersForTests,
  _dropLocalOffersForTests,
  _fireOfferTimerForTests,
} from '../src/realtime/offerEngine';

const mutableEnv = env as unknown as Record<string, unknown>;
const REDIS_URL = 'redis://localhost:6379';

function redisOn() {
  mutableEnv.REDIS_URL = REDIS_URL;
}

afterEach(async () => {
  jest.restoreAllMocks();
  _clearAllOffersForTests();
  await getRedis()?.flushall();
  mutableEnv.REDIS_URL = undefined;
  await closeRedis();
  workerProcessors.length = 0;
  mockUpsert.mockClear();
});

describe('without Redis', () => {
  it('nothing is shared: no client, in-memory limiter store, and health says not configured', async () => {
    expect(redisEnabled()).toBe(false);
    expect(getRedis()).toBeNull();
    expect(storeFor('x')).toEqual({});
    expect(await redisHealth()).toEqual({ configured: false });
    expect((await request(app).get('/api/health')).body.redis).toEqual({ configured: false });
  });

  it('scheduled jobs fall back to in-process timers', async () => {
    const a = jest.spyOn(scheduledBooking, 'startScheduledBookingReleaser').mockImplementation(() => undefined);
    const b = jest.spyOn(incentives, 'startScheduledIncentiveRunner').mockImplementation(() => undefined);
    const c = jest.spyOn(welfareService, 'startWelfareRunner').mockReturnValue(null);
    const d = jest.spyOn(contractService, 'startContractRunner').mockReturnValue(null);
    expect(await startRecurringJobs()).toBe('intervals');
    expect([a, b, c, d].every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('a limiter with no store counts in memory', async () => {
    const a = express();
    a.use(rateLimit({ ...storeFor('mem'), windowMs: 60_000, max: 1, keyGenerator: () => 'k' }), (_q, r) => r.send('ok'));
    expect((await request(a).get('/')).status).toBe(200);
    expect((await request(a).get('/')).status).toBe(429);
  });

  it('reads stay on the primary', () => {
    const read = jest.fn();
    onSecondary({ read });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('with Redis', () => {
  it('health reports it connected, and reads go to a secondary', async () => {
    redisOn();
    expect(redisEnabled()).toBe(true);
    expect(await redisHealth()).toEqual({ configured: true, connected: true });
    expect((await request(app).get('/api/health')).body.redis).toEqual({ configured: true, connected: true });
    const read = jest.fn();
    onSecondary({ read });
    expect(read).toHaveBeenCalledWith('secondaryPreferred');
  });

  // ioredis-mock cannot run the Lua scripts rate-limit-redis uses, so these
  // two check the wiring against a stub client; the shared counting itself is
  // rate-limit-redis's, and is checked against a live Redis at deploy time.
  function stubClient() {
    const calls: string[][] = [];
    const client = {
      call: jest.fn(async (command: string, ...args: string[]) => {
        calls.push([command, ...args]);
        return command.toUpperCase() === 'SCRIPT' ? 'sha-abc' : [1, 60000];
      }),
    };
    jest.spyOn(redisModule, 'getRedis').mockReturnValue(client as never);
    return { client, calls };
  }

  it('each limiter stores its counters in Redis under its own prefix, through ioredis call()', async () => {
    redisOn();
    const { calls } = stubClient();
    const { store } = storeFor('auth') as { store: { init?: (o: unknown) => void; increment: (k: string) => Promise<unknown> } };
    store.init?.({ windowMs: 60_000 });
    await store.increment('1.2.3.4:/signup');
    const keyed = calls.filter((c) => c[0].toUpperCase() === 'EVALSHA').map((c) => c.join(' '));
    expect(keyed.some((c) => c.includes('rl:auth:1.2.3.4:/signup'))).toBe(true);
  });

  it('two limiters never write to the same key', async () => {
    redisOn();
    const { calls } = stubClient();
    for (const name of ['first', 'second']) {
      const { store } = storeFor(name) as { store: { init?: (o: unknown) => void; increment: (k: string) => Promise<unknown> } };
      store.init?.({ windowMs: 60_000 });
      await store.increment('same-ip');
    }
    const keys = calls.filter((c) => c[0].toUpperCase() === 'EVALSHA').map((c) => c.join(' '));
    expect(keys.some((c) => c.includes('rl:first:same-ip'))).toBe(true);
    expect(keys.some((c) => c.includes('rl:second:same-ip'))).toBe(true);
    expect(keys.some((c) => c.includes('rl:first:same-ip') && c.includes('rl:second:same-ip'))).toBe(false);
  });

  it('without Redis the same limiter works on in-memory counts', async () => {
    mutableEnv.REDIS_URL = undefined;
    const a = express();
    a.use(rateLimit({ ...storeFor('mem2'), windowMs: 60_000, max: 2, keyGenerator: () => 'k' }), (_q, r) => r.send('ok'));
    expect([(await request(a).get('/')).status, (await request(a).get('/')).status, (await request(a).get('/')).status]).toEqual([200, 200, 429]);
  });

  it('Socket.io uses the Redis adapter', () => {
    redisOn();
    const server = http.createServer();
    const io = initRealtime(server);
    expect(io.of('/').adapter.constructor.name).toMatch(/Redis/i);
    void io.close();
  });
});

describe('recurring jobs with Redis (BullMQ)', () => {
  it('registers each job once, as a repeating schedule with a fixed id, and starts one worker', async () => {
    redisOn();
    expect(await startRecurringJobs()).toBe('bullmq');
    expect(mockUpsert).toHaveBeenCalledTimes(RECURRING_JOBS.length);
    const registered = mockUpsert.mock.calls.map((c) => ({ id: (c as unknown[])[0], every: ((c as unknown[])[1] as { every: number }).every }));
    expect(registered).toEqual(RECURRING_JOBS.map((j) => ({ id: j.name, every: j.everyMs })));
    expect(RECURRING_JOBS.map((j) => j.name)).toEqual([
      'release-scheduled-bookings',
      'run-incentives',
      'welfare-weekly-check',
      'contract-occurrences',
      'police-verification-reminders',
    ]);
    expect(workerProcessors).toHaveLength(1);
    await stopRecurringJobs();
  });

  it('the worker runs the right function for each job, and refuses an unknown one', async () => {
    redisOn();
    const release = jest.spyOn(scheduledBooking, 'releaseDueScheduledBookings').mockResolvedValue(0);
    const inc = jest.spyOn(incentives, 'runAllActiveIncentiveRulesScheduled').mockResolvedValue({ rulesRun: 0, totalGranted: 0 });
    const welfare = jest.spyOn(welfareService, 'runWelfareChecks').mockResolvedValue([]);
    const visits = jest.spyOn(contractService, 'generateVisits').mockResolvedValue(0);
    const police = jest.spyOn(policeService, 'runPoliceVerificationReminders').mockResolvedValue({ sent30: 0, sent7: 0, expired: 0 });
    await startRecurringJobs();
    const run = workerProcessors[0];
    await run({ name: 'release-scheduled-bookings' });
    await run({ name: 'run-incentives' });
    await run({ name: 'welfare-weekly-check' });
    await run({ name: 'contract-occurrences' });
    await run({ name: 'police-verification-reminders' });
    expect([release, inc, welfare, visits, police].map((s) => s.mock.calls.length)).toEqual([1, 1, 1, 1, 1]);
    await expect(processJob({ name: 'nonsense' })).rejects.toThrow(/unknown recurring job/);
    await stopRecurringJobs();
  });
});

// ---- offer engine ----

const PICKUP: [number, number] = [78.4867, 17.385];
let n = 0;
async function worker(dLng: number) {
  n += 1;
  const user = await User.create({ name: `W${n}`, phone: `97770${String(n).padStart(5, '0')}`, passwordHash: 'x', role: 'hamali_solo' });
  await HamaliProfile.create({
    userId: user._id,
    type: 'solo',
    workerKind: 'hamali',
    skills: [],
    availabilityStatus: 'online',
    currentLocation: { type: 'Point', coordinates: [PICKUP[0] + dLng, PICKUP[1]] },
  });
  return user;
}
async function job() {
  n += 1;
  const customer = await User.create({ name: `C${n}`, phone: `97771${String(n).padStart(5, '0')}`, passwordHash: 'x', role: 'customer' });
  return Booking.create({
    customerId: customer._id,
    type: 'hamali',
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: PICKUP, address: 'P' },
    dropLocation: { type: 'Point', coordinates: PICKUP, address: 'P' },
    requiredHamaliCount: 1,
    status: 'searching',
    fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 330, workerRate: 300, serviceFeePct: 10, serviceFee: 30 },
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
  });
}
function captureOffers() {
  const offers: string[] = [];
  const closed: string[] = [];
  jest.spyOn(emitters, 'emitBookingOffer').mockImplementation((userId) => void offers.push(userId));
  jest.spyOn(emitters, 'emitOfferClosed').mockImplementation((userId) => void closed.push(userId));
  jest.spyOn(emitters, 'emitBookingMatched').mockResolvedValue(undefined as never);
  return { offers, closed };
}

describe('offer state shared through Redis', () => {
  it('is written to Redis with an expiry when an offer goes out, and removed when it ends', async () => {
    redisOn();
    const w1 = await worker(0.02);
    const b = await job();
    captureOffers();
    await startHamaliOffers(b);
    const key = `offer:${b._id}:hamali`;
    const stored = JSON.parse((await getRedis()!.get(key))!);
    expect(stored).toMatchObject({ bookingId: b._id.toString(), currentCandidateId: w1._id.toString(), seq: 1 });
    expect(stored.timer).toBeUndefined();
    expect(await getRedis()!.ttl(key)).toBeGreaterThan(0);

    await respondToHamaliOffer(b._id.toString(), w1._id.toString(), true); // accepts: job is filled
    expect(await getRedis()!.get(key)).toBeNull();
  });

  it('another instance, which never saw the offer, can take the response and move the offer on', async () => {
    redisOn();
    const w1 = await worker(0.02);
    const w2 = await worker(0.03);
    const b = await job();
    const { offers } = captureOffers();
    await startHamaliOffers(b);
    expect(offers).toEqual([w1._id.toString()]);

    _dropLocalOffersForTests(); // the instance that sent the offer is not the one handling the tap
    expect(_currentOfferFor(b._id.toString(), 'hamali')).toBeNull();

    await respondToHamaliOffer(b._id.toString(), w1._id.toString(), false);
    expect(offers).toEqual([w1._id.toString(), w2._id.toString()]);
    expect(_currentOfferFor(b._id.toString(), 'hamali')?.candidate).toBe(w2._id.toString());
  });

  it('only the worker whose turn it is may answer, from any instance', async () => {
    redisOn();
    const w1 = await worker(0.02);
    const w2 = await worker(0.03);
    const b = await job();
    captureOffers();
    await startHamaliOffers(b);
    _dropLocalOffersForTests();
    await expect(respondToHamaliOffer(b._id.toString(), w2._id.toString(), true)).rejects.toMatchObject({ statusCode: 409 });
    await expect(respondToHamaliOffer(b._id.toString(), w1._id.toString(), false)).resolves.toBeUndefined();
  });

  it('a countdown that fires after another instance has moved on does nothing', async () => {
    redisOn();
    await worker(0.02);
    const w2 = await worker(0.03);
    const b = await job();
    const { offers, closed } = captureOffers();
    await startHamaliOffers(b);
    // Another instance advanced the offer: the stored number is now ahead of ours.
    const key = `offer:${b._id}:hamali`;
    const stored = JSON.parse((await getRedis()!.get(key))!);
    await getRedis()!.set(key, JSON.stringify({ ...stored, seq: stored.seq + 1, currentCandidateId: w2._id.toString() }), 'EX', 600);

    await _fireOfferTimerForTests(b._id.toString(), 'hamali');
    expect(offers).toHaveLength(1); // nobody new was offered
    expect(closed).toHaveLength(0); // and nobody was told their offer timed out
    expect(_currentOfferFor(b._id.toString(), 'hamali')).toBeNull(); // our stale copy was dropped
  });

  it('a countdown that fires while it is still the current offer does advance it', async () => {
    redisOn();
    const w1 = await worker(0.02);
    const w2 = await worker(0.03);
    const b = await job();
    const { offers, closed } = captureOffers();
    await startHamaliOffers(b);
    await _fireOfferTimerForTests(b._id.toString(), 'hamali');
    expect(closed).toEqual([w1._id.toString()]);
    expect(offers).toEqual([w1._id.toString(), w2._id.toString()]);
  });

  it('two instances cannot handle the same offer at once: the second is told to retry', async () => {
    redisOn();
    const w1 = await worker(0.02);
    const b = await job();
    captureOffers();
    await startHamaliOffers(b);
    await getRedis()!.set(`offerlock:${b._id}:hamali`, 'someone-else', 'PX', 10_000);
    await expect(respondToHamaliOffer(b._id.toString(), w1._id.toString(), true)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('without Redis nothing is written and the offer behaves as before', async () => {
    expect(redisEnabled()).toBe(false);
    const w1 = await worker(0.02);
    const b = await job();
    const { offers } = captureOffers();
    await startHamaliOffers(b);
    expect(offers).toEqual([w1._id.toString()]);
    expect(_currentOfferFor(b._id.toString(), 'hamali')?.candidate).toBe(w1._id.toString());
  });
});
