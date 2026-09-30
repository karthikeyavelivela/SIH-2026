import { Types } from 'mongoose';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { WorkerPricingProfile, type IWorkerPricingProfile } from '../models/WorkerPricingProfile';
import { ApiError } from '../utils/ApiError';

/**
 * A society's published services as a catalogue in the shape ONDC and Beckn
 * use, so the data is ready to be offered on that network.
 *
 * This is an export and nothing more. FYRO is not a registered ONDC network
 * participant, has not submitted this to ONDC, and the output has not been
 * checked by ONDC's validators; `_fyro` on the response says so and the screen
 * that shows it must too. It is checked here only against FYRO's own schema.
 *
 * Only what the society's members chose to publish: their rates, for members
 * whose profile is public. No phone numbers, no addresses, no last names.
 */
export const ONDC_LABEL = 'ONDC-ready catalogue';
export const ONDC_NOTE =
  'An export in Beckn/ONDC catalogue shape. FYRO is not a registered ONDC network participant, this has not been submitted to ONDC, and it has not been checked by ONDC\'s own validators.';

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const money = (n: number) => n.toFixed(2);

interface Item {
  id: string;
  descriptor: { name: string; short_desc?: string };
  price: { currency: 'INR'; value: string };
  category_id: string;
  fulfillment_id: string;
  matched: true;
  tags: { code: string; list: { code: string; value: string }[] }[];
}

function itemsFor(p: IWorkerPricingProfile & { _id: Types.ObjectId }, worker: string): Item[] {
  const base = {
    category_id: p.categorySlug,
    fulfillment_id: 'onsite',
    matched: true as const,
  };
  const items: Item[] = [];
  const tag = (code: string, value: string) => ({ code: 'pricing', list: [{ code, value }] });
  if (p.modesOffered.includes('hourly') && p.hourly?.rate) {
    items.push({
      ...base,
      id: `${p._id}:hourly`,
      descriptor: { name: `${p.categorySlug.replace(/_/g, ' ')} (per hour)`, short_desc: `${worker}. Minimum ${p.hourly.minimumBlockHours} hour(s).` },
      price: { currency: 'INR', value: money(p.hourly.rate) },
      tags: [tag('mode', 'hourly'), tag('unit', 'hour')],
    });
  }
  (p.perUnit ?? []).forEach((u, i) =>
    items.push({
      ...base,
      id: `${p._id}:unit:${i}`,
      descriptor: { name: `${p.categorySlug.replace(/_/g, ' ')} (per ${u.unitType.replace(/_/g, ' ')})`, short_desc: u.description ?? worker },
      price: { currency: 'INR', value: money(u.rate) },
      tags: [tag('mode', 'per_unit'), tag('unit', u.unitType)],
    })
  );
  (p.perTask ?? []).forEach((t, i) =>
    items.push({
      ...base,
      id: `${p._id}:task:${i}`,
      descriptor: { name: t.taskName, short_desc: t.description ?? worker },
      price: { currency: 'INR', value: money(t.fixedPrice) },
      tags: [tag('mode', 'per_task')],
    })
  );
  return items;
}

export async function buildCatalogue(societyId: string) {
  const society = await Mutha.findById(societyId).select('name region leaderId memberIds affiliationStatus').lean();
  // A society that is not (or no longer) affiliated publishes nothing; the
  // answer is the same as for one that does not exist.
  if (!society || society.affiliationStatus !== 'affiliated') throw new ApiError(404, 'Society not found');

  const ids = [society.leaderId, ...society.memberIds];
  const people = await User.find({ _id: { $in: ids }, accountStatus: { $ne: 'deleted' }, 'privacySettings.profileVisibility': { $ne: 'private' } })
    .select('name')
    .lean();
  const nameOf = new Map(people.map((u) => [u._id.toString(), firstName(u.name)]));
  const profiles = await WorkerPricingProfile.find({ workerId: { $in: people.map((u) => u._id) }, active: true, societyFloorRespected: true }).lean();

  const items = profiles.flatMap((p) => itemsFor(p as never, nameOf.get(p.workerId.toString()) ?? 'Member'));
  const now = new Date().toISOString();

  return {
    _fyro: { label: ONDC_LABEL, networkParticipant: false, note: ONDC_NOTE, generatedAt: now },
    context: { action: 'on_search', country: 'IND', timestamp: now, version: 'beckn-export-1' },
    message: {
      catalog: {
        'bpp/descriptor': { name: society.name, short_desc: society.region ? `Cooperative labour society, ${society.region}` : 'Cooperative labour society' },
        'bpp/providers': [
          {
            id: society._id.toString(),
            descriptor: { name: society.name },
            fulfillments: [{ id: 'onsite', type: 'On-site service' }],
            items,
          },
        ],
      },
    },
  };
}
