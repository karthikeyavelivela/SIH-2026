import './setup';
import request from 'supertest';
import { Types } from 'mongoose';
import { z } from 'zod';
import { app } from '../src/app';
import { User } from '../src/models/User';
import { Mutha } from '../src/models/Mutha';
import { WorkerPricingProfile } from '../src/models/WorkerPricingProfile';

/*
 * The catalogue is checked against FYRO's own schema for the shape it claims
 * (Beckn catalogue). It has NOT been validated by ONDC, and the tests do not
 * pretend otherwise.
 */
const itemSchema = z.object({
  id: z.string(),
  descriptor: z.object({ name: z.string(), short_desc: z.string().optional() }),
  price: z.object({ currency: z.literal('INR'), value: z.string().regex(/^\d+\.\d{2}$/) }),
  category_id: z.string(),
  fulfillment_id: z.string(),
  matched: z.literal(true),
  tags: z.array(z.object({ code: z.string(), list: z.array(z.object({ code: z.string(), value: z.string() })) })),
});
const catalogueSchema = z.object({
  _fyro: z.object({ label: z.literal('ONDC-ready catalogue'), networkParticipant: z.literal(false), note: z.string().min(40), generatedAt: z.string() }),
  context: z.object({ action: z.literal('on_search'), country: z.literal('IND'), timestamp: z.string(), version: z.string() }),
  message: z.object({
    catalog: z.object({
      'bpp/descriptor': z.object({ name: z.string(), short_desc: z.string().optional() }),
      'bpp/providers': z.array(
        z.object({
          id: z.string(),
          descriptor: z.object({ name: z.string() }),
          fulfillments: z.array(z.object({ id: z.string(), type: z.string() })),
          items: z.array(itemSchema),
        })
      ),
    }),
  }),
});

let n = 0;
async function member(name: string, extra: Record<string, unknown> = {}) {
  n += 1;
  return User.create({ name, phone: `9${String(700000000 + n).padStart(9, '0')}`, passwordHash: 'x', role: 'mutha_member', ...extra });
}
function profile(workerId: Types.ObjectId, extra: Record<string, unknown> = {}) {
  return WorkerPricingProfile.create({
    workerId,
    categorySlug: 'electrical',
    modesOffered: ['hourly', 'per_unit', 'per_task'],
    hourly: { rate: 450, minimumBlockHours: 2, travelIncluded: true },
    perUnit: [{ unitType: 'per_point', rate: 120, minimumQuantity: 1 }],
    perTask: [{ taskName: 'Fan replacement', fixedPrice: 300 }],
    societyFloorRespected: true,
    active: true,
    ...extra,
  });
}
async function society(status = 'affiliated') {
  const leader = await member('Leela Devi Reddy', { role: 'mutha_leader' });
  return { leader, mutha: await Mutha.create({ name: 'Guntur Crew Society', leaderId: leader._id, memberIds: [], inviteCode: `C${n}${Date.now() % 1000}`, region: 'Guntur', affiliationStatus: status }) };
}

describe('ONDC-ready catalogue — P4.4', () => {
  it('lists what members published, in the catalogue shape, labelled honestly as an export', async () => {
    const { leader, mutha } = await society();
    const ravi = await member('Ravi Kumar Naidu');
    await Mutha.updateOne({ _id: mutha._id }, { memberIds: [ravi._id] });
    await profile(ravi._id);
    await profile(leader._id, { categorySlug: 'plumbing', modesOffered: ['hourly'], perUnit: [], perTask: [], hourly: { rate: 380, minimumBlockHours: 1, travelIncluded: false } });

    const res = await request(app).get(`/api/ondc/catalog/${mutha._id}`);
    expect(res.status).toBe(200);
    const parsed = catalogueSchema.parse(res.body);
    expect(parsed._fyro.note).toMatch(/not a registered ONDC network participant/);
    const items = parsed.message.catalog['bpp/providers'][0].items;
    expect(items).toHaveLength(4);
    expect(items.find((i) => i.descriptor.name === 'Fan replacement')?.price.value).toBe('300.00');
    expect(items.find((i) => i.tags[0].list[0].value === 'hourly' && i.category_id === 'plumbing')?.price.value).toBe('380.00');
    expect(parsed.message.catalog['bpp/providers'][0].id).toBe(mutha._id.toString());
  });

  it('shows first names only, and nothing private: no phone, no last name, no id of a person', async () => {
    const { mutha } = await society();
    const ravi = await member('Ravi Kumar Naidu');
    await Mutha.updateOne({ _id: mutha._id }, { memberIds: [ravi._id] });
    await profile(ravi._id);
    const text = JSON.stringify((await request(app).get(`/api/ondc/catalog/${mutha._id}`)).body);
    expect(text).toContain('Ravi');
    expect(text).not.toContain('Naidu');
    expect(text).not.toContain(ravi.phone);
    expect(text).not.toContain(ravi._id.toString());
  });

  it('leaves out members with a private profile, inactive rates, and rates below a society floor', async () => {
    const { mutha } = await society();
    const priv = await member('Private Person', { 'privacySettings.profileVisibility': 'private' });
    const paused = await member('Paused Person');
    const flagged = await member('Flagged Person');
    await Mutha.updateOne({ _id: mutha._id }, { memberIds: [priv._id, paused._id, flagged._id] });
    await profile(priv._id);
    await profile(paused._id, { active: false });
    await profile(flagged._id, { societyFloorRespected: false });
    const res = await request(app).get(`/api/ondc/catalog/${mutha._id}`);
    expect(catalogueSchema.parse(res.body).message.catalog['bpp/providers'][0].items).toHaveLength(0);
  });

  it('a society that is not affiliated, or does not exist, is a plain not-found', async () => {
    const { mutha } = await society('pending');
    expect((await request(app).get(`/api/ondc/catalog/${mutha._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/ondc/catalog/${new Types.ObjectId()}`)).status).toBe(404);
    expect((await request(app).get('/api/ondc/catalog/not-an-id')).status).toBe(400);
  });

  it('is public (no sign-in needed)', async () => {
    const { mutha } = await society();
    expect((await request(app).get(`/api/ondc/catalog/${mutha._id}`)).status).toBe(200);
  });
});
