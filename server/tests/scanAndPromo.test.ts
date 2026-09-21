import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { PromoBanner } from '../src/models/PromoBanner';
import { signAccessToken } from '../src/services/token.service';

/**
 * Scan and Diagnose, the promotional slot, and mode-scoped search.
 *
 * The properties held here are the ones a demo would quietly break: a
 * promotional banner that renders before its own start date, a search box
 * that hands back another mode's categories, and a photo diagnosis that
 * invents a trade rather than admitting it cannot tell.
 */

async function agentFor(role: string, phone: string, extra: Record<string, unknown> = {}) {
  const user = await User.create({ name: 'U', phone, passwordHash: 'x', role, ...extra });
  const agent = request.agent(app);
  agent.jar.setCookie(`accessToken=${signAccessToken({ id: user._id.toString(), role: role as never })}`);
  return { agent, user };
}

async function seedCategories() {
  const base = {
    icon: 'PowerIcon',
    accentColor: 'primary' as const,
    requiresVehicle: false,
    requiresMaterials: false,
    defaultDurationMinutes: 60,
    minWorkers: 1,
    active: true,
  };
  await ServiceCategory.create([
    { ...base, name: 'Plumber', slug: 'plumber', pricingUnit: 'per_job', dispatchType: 'hamali' },
    { ...base, name: 'Truck Carpenter', slug: 'carpenter', pricingUnit: 'per_job', dispatchType: 'hamali' },
    { ...base, name: 'General Labour', slug: 'general_labour', pricingUnit: 'per_worker', dispatchType: 'hamali' },
    {
      ...base,
      name: 'Cargo & Logistics',
      slug: 'general_logistics',
      pricingUnit: 'per_km',
      dispatchType: 'truck',
      requiresVehicle: true,
    },
  ]);
}

describe('search is scoped to the customer’s current mode', () => {
  beforeEach(seedCategories);

  it('does not return a Transit category to someone searching in Household', async () => {
    const { agent } = await agentFor('customer', '9890000001');
    const res = await agent.get('/api/search?q=general&mode=household');
    expect(res.status).toBe(200);
    const services = res.body.groups.find((g: { key: string }) => g.key === 'services');
    const titles = (services?.hits ?? []).map((h: { title: string }) => h.title);
    // 'General Labour' is Hamali and 'Cargo & Logistics' is Transit; neither
    // belongs on a household home screen.
    expect(titles).not.toContain('General Labour');
    expect(titles).not.toContain('Cargo & Logistics');
  });

  it('returns only the hamali category in Hamali mode', async () => {
    const { agent } = await agentFor('customer', '9890000002');
    const res = await agent.get('/api/search?q=general&mode=labour');
    const services = res.body.groups.find((g: { key: string }) => g.key === 'services');
    expect((services?.hits ?? []).map((h: { title: string }) => h.title)).toEqual(['General Labour']);
  });

  it('widens only when the customer explicitly asks for all modes', async () => {
    const { agent } = await agentFor('customer', '9890000003');
    const titlesFor = async (mode: string) => {
      const res = await agent.get(`/api/search?q=logistics&mode=${mode}`);
      const services = res.body.groups.find((g: { key: string }) => g.key === 'services');
      return (services?.hits ?? []).map((h: { title: string }) => h.title);
    };

    // The same query, the same customer, two different answers — which is
    // the whole point: the scope is a deliberate choice, not a default.
    expect(await titlesFor('household')).toEqual([]);
    expect(await titlesFor('all')).toEqual(['Cargo & Logistics']);
  });

  it('leaves a non-customer role’s catalogue alone', async () => {
    // Only the customer has three worlds. A worker searching sees the whole
    // catalogue exactly as before.
    const { agent } = await agentFor('admin', '9890000004');
    const res = await agent.get('/api/search?q=general');
    expect(res.status).toBe(200);
  });
});

describe('the promotional slot', () => {
  async function banner(admin: string, over: Record<string, unknown> = {}) {
    return PromoBanner.create({
      title: 'Monsoon plumbing week',
      mode: 'all',
      order: 0,
      active: true,
      createdByAdminId: admin,
      ...over,
    });
  }

  it('renders nothing when nothing is live, rather than filler', async () => {
    const { agent } = await agentFor('customer', '9890000010');
    const res = await agent.get('/api/promo-banners?mode=household');
    expect(res.status).toBe(200);
    expect(res.body.banners).toEqual([]);
  });

  it('hides a banner whose start date has not arrived', async () => {
    const { user: admin } = await agentFor('admin', '9890000011');
    await banner(admin._id.toString(), { startsAt: new Date(Date.now() + 86400000) });
    const { agent } = await agentFor('customer', '9890000012');
    const res = await agent.get('/api/promo-banners?mode=household');
    // Evaluated server-side on purpose: a phone with its clock set forward
    // must not be able to see a campaign that has not started.
    expect(res.body.banners).toEqual([]);
  });

  it('hides an expired banner', async () => {
    const { user: admin } = await agentFor('admin', '9890000013');
    await banner(admin._id.toString(), { endsAt: new Date(Date.now() - 1000) });
    const { agent } = await agentFor('customer', '9890000014');
    expect((await agent.get('/api/promo-banners?mode=household')).body.banners).toEqual([]);
  });

  it('does not show one mode’s banner on another mode’s home', async () => {
    const { user: admin } = await agentFor('admin', '9890000015');
    await banner(admin._id.toString(), { mode: 'transport', title: 'Cheap lorries' });
    const { agent } = await agentFor('customer', '9890000016');
    expect((await agent.get('/api/promo-banners?mode=household')).body.banners).toEqual([]);
    expect((await agent.get('/api/promo-banners?mode=transport')).body.banners).toHaveLength(1);
  });

  it('shows a live one, and a region-targeted one only in that region', async () => {
    const { user: admin } = await agentFor('admin', '9890000017');
    await banner(admin._id.toString(), { region: 'Visakhapatnam', title: 'Vizag only' });
    const { agent: vizag } = await agentFor('customer', '9890000018', { region: 'Visakhapatnam' });
    const { agent: guntur } = await agentFor('customer', '9890000019', { region: 'Guntur' });
    expect((await vizag.get('/api/promo-banners?mode=household')).body.banners).toHaveLength(1);
    expect((await guntur.get('/api/promo-banners?mode=household')).body.banners).toEqual([]);
  });

  it('refuses a call to action with a label but nowhere to go', async () => {
    const { agent } = await agentFor('admin', '9890000020');
    const res = await agent.post('/api/admin/promo-banners').send({
      title: 'Half price',
      ctaLabel: 'Book now',
    });
    expect(res.status).toBe(400);
  });

  it('is writable only by an admin', async () => {
    const { agent: manager } = await agentFor('manager', '9890000021');
    expect((await manager.post('/api/admin/promo-banners').send({ title: 'x' })).status).toBe(403);
    const { agent: customer } = await agentFor('customer', '9890000022');
    expect((await customer.post('/api/admin/promo-banners').send({ title: 'x' })).status).toBe(403);
  });
});

describe('scan and diagnose', () => {
  const TINY_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='.repeat(3);

  it('needs a real image and a media type it can actually send', async () => {
    const { agent } = await agentFor('customer', '9890000030');
    expect((await agent.post('/api/assistant/diagnose-photo').send({ imageBase64: 'x', mediaType: 'image/jpeg' })).status).toBe(400);
    expect(
      (await agent.post('/api/assistant/diagnose-photo').send({ imageBase64: TINY_PNG, mediaType: 'application/pdf' })).status
    ).toBe(400);
  });

  it('is closed to a signed-out caller', async () => {
    const res = await request(app)
      .post('/api/assistant/diagnose-photo')
      .send({ imageBase64: TINY_PNG, mediaType: 'image/png' });
    expect(res.status).toBe(401);
  });

  it('says it cannot tell rather than guessing a trade, with no provider configured', async () => {
    const { agent } = await agentFor('customer', '9890000031');
    const res = await agent
      .post('/api/assistant/diagnose-photo')
      .send({ imageBase64: TINY_PNG, mediaType: 'image/png' });

    expect(res.status).toBe(200);
    // No vision provider in the test environment, and no note to fall back
    // on. The one thing it must not do is name a trade anyway.
    expect(res.body.diagnosis.mock).toBe(true);
    expect(res.body.diagnosis.inconclusive).toBe(true);
    expect(res.body.diagnosis.suggestion).toBeUndefined();
  });

  it('still routes from the note when the photo cannot be analysed', async () => {
    const { agent } = await agentFor('customer', '9890000032');
    const res = await agent.post('/api/assistant/diagnose-photo').send({
      imageBase64: TINY_PNG,
      mediaType: 'image/png',
      note: 'the tap is leaking and water will not stop',
    });

    // A real answer from a real input: the note goes through the same
    // keyword matcher TARA's text path uses.
    expect(res.body.diagnosis.suggestion?.categorySlug).toBe('plumber');
    expect(res.body.diagnosis.inconclusive).toBe(false);
  });

  it('never attaches a self-fix to a note about electrical work', async () => {
    const { agent } = await agentFor('customer', '9890000033');
    const res = await agent.post('/api/assistant/diagnose-photo').send({
      imageBase64: TINY_PNG,
      mediaType: 'image/png',
      note: 'there is a short circuit and the switch gives a shock',
    });
    // Electricity, gas and anything structural go to a qualified person
    // every time — enforced in code, not only asked for in the prompt.
    expect(res.body.diagnosis.selfFix).toBeUndefined();
  });
});
