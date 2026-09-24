import './setup';
import request from 'supertest';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { ServiceCategory } from '../src/models/ServiceCategory';
import { PromoBanner } from '../src/models/PromoBanner';
import { ensurePromoBanners } from '../src/services/promoBannerSeed';
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

  it('attaches no photo URL when nothing was actually stored', async () => {
    // Without Cloudinary credentials the upload returns a deterministic
    // fake URL. Carrying that onto a booking would put a broken image on
    // the assigned worker's screen — worse than no image, because it looks
    // like the customer sent one and it failed to load.
    const { agent } = await agentFor('customer', '9890000034');
    const res = await agent
      .post('/api/assistant/diagnose-photo')
      .send({ imageBase64: TINY_PNG, mediaType: 'image/png' });
    expect(res.body.photoUrl).toBeUndefined();
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

describe('uploads that cannot actually store anything', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('hides an avatar that was saved before the refusal existed', async () => {
    // Rows written by the old behaviour are real and cannot be un-written
    // by a code change. Stripped at the read boundary so every screen
    // falls back to the initial instead of showing a broken image.
    const { agent, user } = await agentFor('customer', '9890000041');
    await User.findByIdAndUpdate(user._id, {
      profilePhoto: 'https://mock.cloudinary.local/users/x/avatar-1.jpg',
    });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.profilePhoto).toBeUndefined();
  });

  it('refuses a profile photo rather than saving a URL that does not exist', async () => {
    const { agent, user } = await agentFor('customer', '9890000040');
    const res = await agent.patch('/api/auth/me/photo').send({ imageBase64: PNG });

    // Without Cloudinary credentials this used to return 200 and save
    // https://mock.cloudinary.local/... — a "saved" toast and a
    // permanently broken avatar the person could neither see nor clear.
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/not switched on/i);

    const after = await User.findById(user._id).select('profilePhoto').lean();
    expect(after?.profilePhoto).toBeFalsy();
  });
});

describe('the starter banners', () => {
  it('seeds three, and never recreates one an admin deleted', async () => {
    await User.create({ name: 'Root', phone: '9899000001', passwordHash: 'x', role: 'admin' });

    expect(await ensurePromoBanners()).toBe(3);
    // Idempotent: a restart must not duplicate them.
    expect(await ensurePromoBanners()).toBe(0);

    const all = await PromoBanner.find().lean();
    expect(all).toHaveLength(3);

    // An admin switching one off is a decision, not a gap to fill on the
    // next boot. (Switching off is the only removal the API offers — there
    // is no DELETE route, deliberately, so a banner's history survives.)
    await PromoBanner.updateOne({ sourceKey: 'seed:scan' }, { active: false });
    expect(await ensurePromoBanners()).toBe(0);
    expect(await PromoBanner.countDocuments({ active: true })).toBe(2);
  });

  it('attributes nothing when there is no admin to attribute it to', async () => {
    expect(await ensurePromoBanners()).toBe(0);
    expect(await PromoBanner.countDocuments()).toBe(0);
  });

  it('gives every seeded banner a photograph, and backfills ones seeded before it had one', async () => {
    await User.create({ name: 'Root', phone: '9899000003', passwordHash: 'x', role: 'admin' });
    await ensurePromoBanners();
    for (const b of await PromoBanner.find().lean()) {
      expect(b.imageUrl).toMatch(/^https:\/\/res\.cloudinary\.com\/.+c_fill,g_auto,ar_2:1/);
    }

    // A row from before the rail went image-only: no picture.
    await PromoBanner.updateOne({ sourceKey: 'seed:itemised' }, { $unset: { imageUrl: 1 } });
    // And one an admin has given their own picture.
    await PromoBanner.updateOne({ sourceKey: 'seed:scan' }, { imageUrl: 'https://res.cloudinary.com/x/admin-chosen.jpg' });

    expect(await ensurePromoBanners()).toBe(0); // backfill is not creation
    expect((await PromoBanner.findOne({ sourceKey: 'seed:itemised' }).lean())?.imageUrl).toMatch(/c_fill/);
    // Never overwrites a picture somebody chose.
    expect((await PromoBanner.findOne({ sourceKey: 'seed:scan' }).lean())?.imageUrl).toBe(
      'https://res.cloudinary.com/x/admin-chosen.jpg'
    );
  });

  it('withdraws a retired photograph from every banner still using it', async () => {
    const admin = await User.create({ name: 'Root', phone: '9899000004', passwordHash: 'x', role: 'admin' });
    await ensurePromoBanners();
    const retired = 'https://res.cloudinary.com/blewsamc/image/upload/c_fill,g_auto,ar_2:1,w_1200,f_auto,q_auto/30.Woman_with_toolbag';
    await PromoBanner.updateOne({ sourceKey: 'seed:wage-floor' }, { imageUrl: retired });
    const custom = await PromoBanner.create({
      title: 'Admin banner', mode: 'all', order: 9, active: true, imageUrl: retired, createdByAdminId: admin._id,
    });

    await ensurePromoBanners();

    const seeded = await PromoBanner.findOne({ sourceKey: 'seed:wage-floor' }).lean();
    expect(seeded?.imageUrl).not.toContain('Woman_with_toolbag');
    expect(seeded?.imageUrl).toMatch(/c_fill,g_auto,ar_2:1/);
    expect((await PromoBanner.findById(custom._id).lean())?.imageUrl).toBeUndefined();
    expect(await PromoBanner.countDocuments({ imageUrl: /Woman_with_toolbag/ })).toBe(0);
  });

  it('puts the scan banner on the household home only', async () => {
    await User.create({ name: 'Root', phone: '9899000002', passwordHash: 'x', role: 'admin' });
    await ensurePromoBanners();
    const scan = await PromoBanner.findOne({ sourceKey: 'seed:scan' }).lean();
    // Scan and Diagnose names household trades; offering it in Transit
    // would send someone a carpenter for a photo of a pallet.
    expect(scan?.mode).toBe('household');
  });
});
