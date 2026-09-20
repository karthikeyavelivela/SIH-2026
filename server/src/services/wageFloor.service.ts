import { ApiError } from '../utils/ApiError';
import {
  GovernmentWageFloor,
  IGovernmentWageFloor,
  SkillBand,
  WageZone,
  DEFAULT_WORKING_DAYS_PER_MONTH,
  DEFAULT_WORKING_HOURS_PER_DAY,
} from '../models/GovernmentWageFloor';

/**
 * The statutory floor beneath every rate on the platform.
 *
 * FYRO's own fair-wage machinery already had two layers — a society's
 * bye-law floor, and the federation's cap above it — but both are the
 * cooperative's own numbers. This is the one that is not ours: it comes
 * from a state government notification, and a rate below it is not merely
 * low, it is unlawful. So it is enforced in the API before anything is
 * written, it is named in the refusal, and it is shown to the customer and
 * to the worker rather than being an invisible check.
 */

/* ------------------------------------------------------------------ zones */

/**
 * Which zone a FYRO region sits in.
 *
 * The notification defines Zone I as areas under municipal corporations
 * and selection- or special-grade municipalities, and Zone II as everywhere
 * else — so the zone is a property of the WORK ADDRESS, while FYRO prices
 * by district. A district contains both.
 *
 * Every district FYRO serves is named after its corporation or
 * selection-grade municipality seat, so Zone I is the right answer for the
 * seat itself and the wrong one for a village an hour away. Where the two
 * disagree this resolves to Zone I on purpose: Zone I is the HIGHER floor,
 * and enforcing the higher of two candidate floors can only ever refuse a
 * rate that was lawful somewhere, never allow one that was unlawful
 * everywhere. A wage floor that errs should err upward.
 *
 * A caller that genuinely knows the work is in a Zone II area can pass the
 * zone explicitly.
 */
export function zoneForRegion(_region: string): WageZone {
  return 'zone_1';
}

/* ------------------------------------------------- category -> skill band */

/**
 * FYRO's classification of its own twelve trades, not the government's.
 *
 * The notification classifies by scheduled employment and designation, and
 * "plumber booked through an app" is not one of its designations. Someone
 * has to decide which band each trade belongs to, and pretending otherwise
 * would mean either refusing to enforce anything or quietly picking a band
 * with no reasoning attached. The reasoning:
 *
 *   - SKILLED covers the trades that carry a recognised competency and,
 *     in the electrician's case, a statutory licence. Wiring a house, a
 *     pressure line, a wardrobe carcass and a sealed refrigeration system
 *     are all work where doing it wrong is dangerous.
 *   - DRIVER is skilled: a commercial licence is a statutory qualification.
 *   - SEMI-SKILLED covers trades with real craft but no licensing regime —
 *     painting, cooking and household management, and personal care, where
 *     experience is what distinguishes a good worker from a new one.
 *   - UNSKILLED is the Act's own term for general manual work, not a
 *     judgement about the person doing it. Loading, cleaning and garden
 *     labour sit here because that is where the schedules put them.
 *
 * Deliberately visible, deliberately arguable, and deliberately in one
 * place so that changing it is a decision rather than an accident.
 */
export const CATEGORY_SKILL_BANDS: Record<string, SkillBand> = {
  electrician: 'skilled',
  plumber: 'skilled',
  carpenter: 'skilled',
  technician: 'skilled',
  driver: 'skilled',
  painter: 'semi_skilled',
  domestic_helper: 'semi_skilled',
  caregiver: 'semi_skilled',
  general_labour: 'unskilled',
  general_logistics: 'unskilled',
  cleaner: 'unskilled',
  gardener: 'unskilled',
};

/**
 * The band to enforce for a category.
 *
 * An unrecognised slug falls to 'unskilled' — the LOWEST floor — because a
 * category nobody has classified must not have a skilled worker's floor
 * imposed on it by accident. The visible consequence of forgetting to map
 * a new trade is then a floor that is too permissive, which an admin can
 * see and fix, rather than a wall of refusals nobody can explain.
 */
export function skillBandForCategory(categorySlug?: string): SkillBand {
  return (categorySlug && CATEGORY_SKILL_BANDS[categorySlug]) || 'unskilled';
}

/* --------------------------------------------------------- the floor rows */

/** Monthly -> daily -> hourly, with the divisors the row itself carries. */
export function deriveRates(
  monthlyRate: number,
  workingDaysPerMonth = DEFAULT_WORKING_DAYS_PER_MONTH,
  workingHoursPerDay = DEFAULT_WORKING_HOURS_PER_DAY
): { dailyRate: number; hourlyRate: number } {
  const dailyRate = Math.round((monthlyRate / workingDaysPerMonth) * 100) / 100;
  const hourlyRate = Math.round((dailyRate / workingHoursPerDay) * 100) / 100;
  return { dailyRate, hourlyRate };
}

/**
 * The applicable floor, or null when the state has none published.
 *
 * Null is a real and common answer: the notification this ships with is
 * Andhra Pradesh's, and FYRO serves six states. A state with no row is not
 * unregulated — it is a state whose notification nobody has entered yet —
 * so nothing is enforced there and the UI says so, rather than borrowing
 * another state's figures.
 */
export async function wageFloorFor(
  state: string,
  skillBand: SkillBand,
  zone: WageZone = 'zone_1'
): Promise<IGovernmentWageFloor | null> {
  return GovernmentWageFloor.findOne({ state, zone, skillBand, active: true }).lean();
}

export interface FloorComparison {
  floor: IGovernmentWageFloor;
  /** The rate being checked, expressed per hour so it is comparable. */
  hourlyEquivalent: number;
  meetsFloor: boolean;
}

/**
 * Everything on this platform is eventually an hourly equivalent.
 *
 * An hourly rate is already one. A per-day rate divides by the working day.
 * A per-task or per-unit rate is the hard case and is NOT converted here:
 * a ₹400 hinge replacement that takes twenty minutes is not a ₹400 hourly
 * rate and not a ₹50 one either, and inventing a duration to divide by
 * would produce a number the platform would then enforce against. Those
 * modes are checked against the DAILY floor only when the work is priced
 * by the day; otherwise they are left alone and said to be left alone.
 */
export function hourlyEquivalentOf(
  amount: number,
  unit: 'per_hour' | 'per_day' | 'per_month',
  floor: IGovernmentWageFloor
): number {
  if (unit === 'per_hour') return amount;
  if (unit === 'per_day') return Math.round((amount / floor.workingHoursPerDay) * 100) / 100;
  return Math.round((amount / floor.workingDaysPerMonth / floor.workingHoursPerDay) * 100) / 100;
}

/** Compares a rate to the floor without throwing — for display. */
export async function compareToFloor(
  state: string,
  skillBand: SkillBand,
  amount: number,
  unit: 'per_hour' | 'per_day' | 'per_month',
  zone: WageZone = 'zone_1'
): Promise<FloorComparison | null> {
  const floor = await wageFloorFor(state, skillBand, zone);
  if (!floor) return null;
  const hourlyEquivalent = hourlyEquivalentOf(amount, unit, floor);
  return { floor, hourlyEquivalent, meetsFloor: hourlyEquivalent >= floor.hourlyRate };
}

/**
 * Refuses a rate below the statutory floor, naming the notification.
 *
 * Refuses rather than clamps, for the same reason the society floor
 * refuses: silently raising someone's published rate puts a number on the
 * board they never chose, and they would find out when a customer booked
 * it. A message that names the notification is also the only version of
 * this a worker can check, or dispute.
 */
export async function assertAtOrAboveStatutoryFloor(opts: {
  state: string;
  skillBand: SkillBand;
  amount: number;
  unit: 'per_hour' | 'per_day' | 'per_month';
  zone?: WageZone;
  /** Named in the message so the worker knows WHICH of their rates is wrong. */
  label?: string;
}): Promise<void> {
  const comparison = await compareToFloor(
    opts.state,
    opts.skillBand,
    opts.amount,
    opts.unit,
    opts.zone ?? 'zone_1'
  );
  // No published floor for this state is not a failure — see wageFloorFor.
  if (!comparison || comparison.meetsFloor) return;

  const { floor, hourlyEquivalent } = comparison;
  const what = opts.label ? `${opts.label} works out at` : 'That rate works out at';
  throw new ApiError(
    422,
    `${what} ₹${hourlyEquivalent} an hour, below the ₹${floor.hourlyRate} an hour statutory minimum for ` +
      `${bandLabel(floor.skillBand)} work in ${floor.state} ` +
      `(₹${floor.monthlyRate} a month ÷ ${floor.workingDaysPerMonth} days ÷ ${floor.workingHoursPerDay} hours, ` +
      `Notification ${floor.notificationNumber}).`
  );
}

export function bandLabel(band: SkillBand): string {
  return band.replace(/_/g, '-');
}

/* --------------------------------------------------- region -> state */

/**
 * Which state a FYRO region belongs to.
 *
 * Read from the federation hierarchy rather than a hardcoded list: every
 * district federation reports into a state federation whose `region` IS the
 * state name, so the answer is already in the data and stays right when a
 * district is added. Cached for the same reason the priced-region set is —
 * this runs on every rate publish and the hierarchy changes about as often
 * as a state is created.
 */
let stateByRegion: Map<string, string> | null = null;
let stateByRegionAt = 0;
const STATE_CACHE_TTL_MS = 5 * 60 * 1000;

export function clearStateForRegionCache(): void {
  stateByRegion = null;
  stateByRegionAt = 0;
}

export async function stateForRegion(region: string): Promise<string | null> {
  if (!region?.trim()) return null;
  if (!stateByRegion || Date.now() - stateByRegionAt >= STATE_CACHE_TTL_MS) {
    const { Federation } = await import('../models/Federation');
    const [districts, states] = await Promise.all([
      Federation.find({ type: 'district' }).select('region parentFederationId').lean(),
      Federation.find({ type: 'state' }).select('region').lean(),
    ]);
    const stateNameById = new Map(states.map((s) => [s._id.toString(), s.region]));
    stateByRegion = new Map();
    for (const d of districts) {
      const stateName = d.parentFederationId ? stateNameById.get(d.parentFederationId.toString()) : undefined;
      if (stateName) stateByRegion.set(d.region.trim(), stateName);
    }
    stateByRegionAt = Date.now();
  }
  return stateByRegion.get(region.trim()) ?? null;
}

/* ------------------------------------------------------- fare rules */

/**
 * The hamali fare rule, checked as the wage it actually is.
 *
 * `minimumFare` is what a customer pays to engage one loading worker, and
 * the general-labour category carries a default duration, so the hourly
 * equivalent here is a real number rather than a fabricated one: the
 * minimum fare spread across the engagement the category defines.
 *
 * It is compared GROSS, before the platform's commission and any society
 * deduction. That is the generous reading, and it is the right one to
 * enforce on: the fare rule is not the only thing determining take-home,
 * and refusing a rule because of a deduction a particular society happens
 * to levy would make an admin's fare card hostage to one society's bye-laws.
 * What the worker actually keeps is disclosed separately, itemised, on
 * every job.
 *
 * Vehicle categories are never checked — see the call site.
 */
export async function assertHamaliFareAboveStatutoryFloor(
  region: string,
  category: string,
  minimumFare: number
): Promise<void> {
  if (category !== 'hamali' || !Number.isFinite(minimumFare)) return;

  const state = await stateForRegion(region);
  if (!state) return;

  const { ServiceCategory } = await import('../models/ServiceCategory');
  const labour = await ServiceCategory.findOne({ slug: 'general_labour' })
    .select('defaultDurationMinutes')
    .lean();
  const minutes = labour?.defaultDurationMinutes ?? 60;
  if (minutes <= 0) return;

  const hourly = Math.round(((minimumFare * 60) / minutes) * 100) / 100;
  await assertAtOrAboveStatutoryFloor({
    state,
    skillBand: skillBandForCategory('general_labour'),
    amount: hourly,
    unit: 'per_hour',
    zone: zoneForRegion(region),
    label: `A minimum fare of ₹${minimumFare} for ${minutes} minutes of loading work`,
  });
}
