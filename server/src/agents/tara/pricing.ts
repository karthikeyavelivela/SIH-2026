import { WorkerPricingProfile } from '../../models/WorkerPricingProfile';
import { User } from '../../models/User';
import { guideFor } from '../../services/taskCatalogue';
import type { PricingMode, UnitType } from '@fyro/shared';

/**
 * What TARA knows about how a job gets priced.
 *
 * When somebody describes a problem, the trade is only half the answer. "A
 * leaking tap" and "a full wardrobe" both need a plumber or a carpenter, but
 * one is a fixed-price task and the other is measured work — and telling
 * somebody which, before they start, is the thing that stops a surprise at
 * the end.
 *
 * Every rupee figure TARA states comes from this file, and this file only
 * reads rates that real workers actually published in the asker's own region.
 * There is no fallback band, no "typically around", no number derived from
 * the catalogue's guidance values — those exist for a worker filling in their
 * own form and would be a fabrication if quoted to a customer as a market
 * rate. When nothing is published, `sampleSize` is 0 and TARA is instructed
 * to say so instead of guessing.
 */

export interface ModeAdvice {
  /** The mode this kind of job is normally priced in. */
  mode: PricingMode;
  unitType?: UnitType;
  /** Real published rates, from workers in this region. Empty when nobody has published. */
  low?: number;
  high?: number;
  sampleSize: number;
  /** How many nearby workers take quotation work, for the quotation case. */
  quotationWorkers?: number;
}

/**
 * Words that mean "this is bigger than a single task".
 *
 * A whole-flat rewire is not a per-point job even though rewiring is
 * per-point work, and a full wardrobe is not a fixed-price repair. These are
 * the signals that the honest answer is "somebody has to look at it first".
 */
const SCOPE_WORDS = [
  'whole', 'entire', 'full', 'complete', 'all rooms', 'every room', 'flat', 'apartment',
  'house', 'building', 'renovation', 'renovate', 'rewire', 'rewiring', 'remodel',
  'మొత్తం', 'పూర్తి', 'ఇల్లు', 'అపార్ట్‌మెంట్',
  'पूरा', 'पूरी', 'सारा', 'मकान', 'फ्लैट', 'रिनोवेशन',
];

/** Words that describe one discrete broken thing — the per-task signal. */
const REPAIR_WORDS = [
  'repair', 'fix', 'broken', 'not working', 'leaking', 'leak', 'replace', 'service',
  'మరమ్మతు', 'పాడైంది', 'లీక్', 'పనిచేయట్లేదు',
  'मरम्मत', 'ठीक', 'खराब', 'लीक', 'नहीं चल',
];

/** Words that describe making something new and measured. */
const BUILD_WORDS = [
  'new', 'make', 'build', 'install', 'fit', 'wardrobe', 'cupboard', 'shelf', 'shelves',
  'paint', 'painting', 'wiring', 'tiles', 'flooring',
  'కొత్త', 'బీరువా', 'అర', 'పెయింట్', 'వైరింగ్',
  'नया', 'बनवाना', 'अलमारी', 'शेल्फ', 'पेंट', 'वायरिंग',
];

function mentions(text: string, words: string[]): boolean {
  const haystack = text.toLowerCase();
  return words.some((w) => haystack.includes(w.toLowerCase()));
}

/**
 * Which mode this description calls for.
 *
 * Deterministic, like the category match: the model writes the sentence, but
 * which booking path a person is pointed at should be inspectable and should
 * work with no model key configured at all.
 */
export function adviseMode(text: string, categorySlug: string): { mode: PricingMode; unitType?: UnitType } {
  const guide = guideFor(categorySlug);

  // Scope beats everything. A whole-flat job is quoted after a visit whatever
  // trade it belongs to.
  if (mentions(text, SCOPE_WORDS) && guide.suggestedModes.includes('quotation')) {
    return { mode: 'quotation' };
  }

  const supportsTask = guide.suggestedModes.includes('per_task');
  const supportsUnit = guide.suggestedModes.includes('per_unit');

  if (mentions(text, REPAIR_WORDS) && supportsTask) return { mode: 'per_task' };
  if (mentions(text, BUILD_WORDS) && supportsUnit) {
    return { mode: 'per_unit', unitType: guide.units[0]?.unitType };
  }

  // Fall back to whatever this trade normally does first — for a cleaner that
  // is hourly, for a carpenter it is measured work.
  const first = guide.suggestedModes[0] ?? 'hourly';
  return { mode: first, unitType: first === 'per_unit' ? guide.units[0]?.unitType : undefined };
}

/**
 * Real published rates for that trade and mode, near this person.
 *
 * Region match is a plain equality on User.region, the same field every other
 * "near me" surface in this app uses. A wider radius search would be more
 * generous and less true: a rate published in Hyderabad is not evidence about
 * what a job in Visakhapatnam costs.
 */
export async function ratesFor(
  categorySlug: string,
  mode: PricingMode,
  unitType: UnitType | undefined,
  region: string | undefined
): Promise<ModeAdvice> {
  const profiles = await WorkerPricingProfile.find({
    categorySlug,
    active: true,
    societyFloorRespected: true,
    modesOffered: mode,
  })
    .limit(100)
    .lean();

  if (profiles.length === 0) return { mode, unitType, sampleSize: 0 };

  // Only workers in the asker's own region count towards a quoted figure.
  const workerIds = profiles.map((p) => p.workerId);
  const regional = region
    ? new Set(
        (await User.find({ _id: { $in: workerIds }, region }).select('_id').lean()).map((u) => u._id.toString())
      )
    : new Set(workerIds.map((id) => id.toString()));

  const relevant = profiles.filter((p) => regional.has(p.workerId.toString()));
  if (relevant.length === 0) return { mode, unitType, sampleSize: 0 };

  if (mode === 'quotation') {
    return { mode, sampleSize: relevant.length, quotationWorkers: relevant.length };
  }

  const figures: number[] = [];
  for (const profile of relevant) {
    if (mode === 'hourly' && profile.hourly?.rate) figures.push(profile.hourly.rate);
    if (mode === 'per_task') figures.push(...profile.perTask.map((t) => t.fixedPrice));
    if (mode === 'per_unit') {
      const lines = unitType ? profile.perUnit.filter((u) => u.unitType === unitType) : profile.perUnit;
      figures.push(...lines.map((u) => u.rate));
    }
  }

  if (figures.length === 0) return { mode, unitType, sampleSize: 0 };

  return {
    mode,
    unitType,
    low: Math.min(...figures),
    high: Math.max(...figures),
    sampleSize: figures.length,
  };
}

/**
 * The paragraph handed to the model as context.
 *
 * Phrased as facts with their provenance attached, and it states plainly when
 * there is no data — which is what stops the model filling the gap with a
 * plausible-sounding number of its own.
 */
export function describeAdvice(advice: ModeAdvice, categorySlug: string): string {
  const trade = categorySlug.replace(/_/g, ' ');

  if (advice.sampleSize === 0) {
    return `PRICING: this sounds like ${advice.mode.replace(/_/g, ' ')} work for a ${trade}. NO worker near this person has published a rate for it, so you must say you cannot quote a figure and offer to show who is available. Do NOT state any price.`;
  }

  if (advice.mode === 'quotation') {
    return `PRICING: this needs a site visit first — it is too big to price unseen. ${advice.quotationWorkers} ${trade}(s) near this person accept quotation work. Do NOT state a price; a quotation is written after the visit.`;
  }

  const unit =
    advice.mode === 'hourly'
      ? 'per hour'
      : advice.mode === 'per_task'
        ? 'as a fixed price for the job'
        : `per ${advice.unitType?.replace(/_/g, ' ') ?? 'unit'}`;

  return `PRICING: this is ${advice.mode.replace(/_/g, ' ')} work for a ${trade}. ${advice.sampleSize} real published rate(s) from workers near this person range from ₹${advice.low} to ₹${advice.high} ${unit}. You may state that range and you must say it comes from what workers near them have actually published. Never invent a figure outside it.`;
}
