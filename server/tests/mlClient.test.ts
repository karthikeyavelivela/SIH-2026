import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { env } from '../src/config/env';
import { mlForecast, mlPriceAnomaly, mlHealth, mlConfigured } from '../src/services/mlClient';
import { checkHourlyRate } from '../src/services/rateCheck.service';
import { runDemandForecastAgent } from '../src/agents/demandForecastAgent';
import { Booking } from '../src/models/Booking';
import { WorkerPricingProfile } from '../src/models/WorkerPricingProfile';
import { Types } from 'mongoose';

const mutableEnv = env as unknown as Record<string, unknown>;
const realFetch = global.fetch;

function setMl(on: boolean) {
  mutableEnv.ML_SERVICE_URL = on ? 'http://ml.test' : undefined;
  mutableEnv.ML_SERVICE_TOKEN = on ? 'test-token-0123456789' : undefined;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  global.fetch = jest.fn(async (url: unknown, init?: RequestInit) => handler(String(url), init)) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  global.fetch = realFetch;
  setMl(false);
});

describe('mlClient', () => {
  it('reports not_configured without calling out when the URL or token is missing', async () => {
    setMl(false);
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    expect(mlConfigured()).toBe(false);
    expect(await mlForecast({ category: 'x', history: [], start: '2026-10-01' })).toEqual({ ok: false, reason: 'not_configured' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends the bearer token and returns the service data', async () => {
    setMl(true);
    let seen: { url: string; auth?: string } | undefined;
    mockFetch((url, init) => {
      seen = { url, auth: (init?.headers as Record<string, string>).Authorization };
      return json({ category: 'x', forecast: [] });
    });
    const r = await mlForecast({ category: 'x', history: [], start: '2026-10-01' });
    expect(r.ok).toBe(true);
    expect(seen).toEqual({ url: 'http://ml.test/forecast', auth: 'Bearer test-token-0123456789' });
  });

  it('turns an error status, a timeout and a dead host into reasons, never a throw', async () => {
    setMl(true);
    mockFetch(() => json({}, 500));
    expect(await mlPriceAnomaly({ category: 'x', rate: 1, history: [] })).toEqual({ ok: false, reason: 'http_500' });
    mockFetch(() => {
      const e = new Error('t');
      e.name = 'TimeoutError';
      throw e;
    });
    expect(await mlPriceAnomaly({ category: 'x', rate: 1, history: [] })).toEqual({ ok: false, reason: 'timeout' });
    mockFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    expect(await mlPriceAnomaly({ category: 'x', rate: 1, history: [] })).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('health: unconfigured, reachable, and unreachable', async () => {
    setMl(false);
    expect(await mlHealth()).toEqual({ configured: false });
    setMl(true);
    mockFetch(() => json({ model_version: 'v1', insufficient_data: false }));
    expect(await mlHealth()).toMatchObject({ configured: true, reachable: true, modelVersion: 'v1', insufficientData: false });
    mockFetch(() => {
      throw new Error('down');
    });
    expect(await mlHealth()).toMatchObject({ configured: true, reachable: false });
  });

  it('/api/health carries the ML status', async () => {
    setMl(false);
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ml).toEqual({ configured: false });
  });
});

describe('rate check', () => {
  async function seedRates(category: string, rates: number[]) {
    for (const rate of rates) {
      await WorkerPricingProfile.create({
        workerId: new Types.ObjectId(),
        categorySlug: category,
        modesOffered: ['hourly'],
        hourly: { rate, minimumBlockHours: 1, travelIncluded: true },
        societyFloorRespected: true,
        active: true,
      });
    }
  }

  it('falls back to the median rule when ML is off, and says so', async () => {
    await seedRates('electrical', [400, 420, 450, 480, 500, 410]);
    const ok = await checkHourlyRate(new Types.ObjectId().toString(), 'electrical', 450);
    expect(ok).toMatchObject({ source: 'rules', available: true, flagged: false });
    const absurd = await checkHourlyRate(new Types.ObjectId().toString(), 'electrical', 45000);
    expect(absurd).toMatchObject({ source: 'rules', available: true, flagged: true });
  });

  it('says nothing when there are too few comparable rates', async () => {
    await seedRates('carpentry', [400, 420]);
    const r = await checkHourlyRate(new Types.ObjectId().toString(), 'carpentry', 99999);
    expect(r).toMatchObject({ source: 'rules', available: false, flagged: false, reason: 'not_enough_comparable_rates' });
  });

  it('uses the ML verdict when the service answers', async () => {
    await seedRates('plumbing', [400, 420, 450]);
    setMl(true);
    mockFetch(() => json({ available: true, score: 0.7, flagged: true, source: 'fitted_on_request_history', model_version: null, fitted_on_n: 3 }));
    const r = await checkHourlyRate(new Types.ObjectId().toString(), 'plumbing', 9000);
    expect(r).toMatchObject({ source: 'ml', available: true, flagged: true });
  });

  it('drops to the rule when the ML service is down', async () => {
    await seedRates('painting', [400, 420, 450, 460, 470]);
    setMl(true);
    mockFetch(() => json({}, 503));
    const r = await checkHourlyRate(new Types.ObjectId().toString(), 'painting', 450);
    expect(r).toMatchObject({ source: 'rules', available: true, reason: 'ml_http_503' });
  });
});

describe('demand forecast agent', () => {
  async function seedBookings(region: string, n: number) {
    const pt = { type: 'Point' as const, coordinates: [80, 16], address: 'a' };
    for (let i = 0; i < n; i++) {
      await Booking.create({
        customerId: new Types.ObjectId(),
        type: 'hamali',
        region,
        serviceCategorySlug: 'electrical',
        cargoDetails: { weightKg: 0, description: 'x' },
        pickupLocation: pt,
        dropLocation: pt,
        status: 'completed',
        fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 100, total: 100 },
      });
    }
  }

  it('labels the answer rules when ML is off', async () => {
    await seedBookings('Guntur', 25);
    const r = await runDemandForecastAgent('Guntur', 'mutha_leader');
    expect(r.source).toBe('rules');
    expect(r.mlFallbackReason).toBe('not_configured');
  });

  it('labels the answer ml and carries the model numbers as evidence', async () => {
    await seedBookings('Guntur', 25);
    setMl(true);
    const rows = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-0${i + 1}`,
      category: 'electrical',
      prediction: 4.5,
      lower: 2,
      upper: 7,
      method: 'xgboost',
      model_version: 'v20261001',
      trained_on_n: 120,
      cold_start: false,
    }));
    mockFetch(() => json({ category: 'electrical', forecast: rows }));
    const r = await runDemandForecastAgent('Guntur', 'mutha_leader');
    expect(r.source).toBe('ml');
    expect(r.mlModelVersion).toBe('v20261001');
    expect(r.coldStart).toBe(false);
    expect(r.evidence.some((e) => e.label.startsWith('electrical 2026-10-01') && e.value.includes('4.5'))).toBe(true);
  });

  it('falls back to rules, with the reason, when the service fails', async () => {
    await seedBookings('Guntur', 25);
    setMl(true);
    mockFetch(() => json({}, 500));
    const r = await runDemandForecastAgent('Guntur', 'mutha_leader');
    expect(r.source).toBe('rules');
    expect(r.mlFallbackReason).toBe('http_500');
  });

  it('never calls the service when there is too little history to forecast', async () => {
    await seedBookings('Tenali', 3);
    setMl(true);
    const spy = jest.fn();
    global.fetch = spy as unknown as typeof fetch;
    const r = await runDemandForecastAgent('Tenali', 'admin');
    expect(r.confidence).toBe('low');
    expect(spy).not.toHaveBeenCalled();
  });
});
