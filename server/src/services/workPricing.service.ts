import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import {
  skillBandForCategory,
  stateForRegion,
  wageFloorFor,
  zoneForRegion,
  statutoryFloorProblem,
  perMinutesToHourly,
} from './wageFloor.service';
import { Mutha } from '../models/Mutha';
import { ServiceCategory } from '../models/ServiceCategory';
import { SocietyRateFloor } from '../models/SocietyRateFloor';
import { WorkerPricingProfile, IWorkerPricingProfile } from '../models/WorkerPricingProfile';
import { Quotation } from '../models/Quotation';
import type { PricingMode, UnitType } from '@fyro/shared';
import { withServiceFee, splitServiceFee, type FeeSplit } from './serviceFee.service';

/**
 * Work-based pricing: the money math, and the floor that bounds it.
 *
 * Everything a customer is ever charged under the four modes is computed
 * here, server-side, from the worker's own published rates. The client sends
 * a quantity and a mode; it never sends a price, and a price it did send
 * would be ignored.
 *
 * The existing distance-based fare engine (fare.service.ts) is untouched and
 * still prices every truck and hamali dispatch. This sits beside it for the
 * trades, which do not price by distance at all.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ------------------------------------------------------- unit declarations

/**
 * What each unit type actually means, in the words the customer is shown.
 *
 * This is the heart of the whole feature. "₹300 per sq ft" is genuinely
 * ambiguous between the visible front face and the developed area counting
 * every internal shelf — a difference of up to 40% of a carpentry bill, and
 * the single most common cause of real disputes in the trade. FYRO makes the
 * worker declare which one, and shows the customer this sentence before they
 * confirm. The sentence is then frozen onto the booking and printed on the
 * invoice, so there is nothing left to argue about afterwards.
 *
 * English only here: the localised versions live in the client's i18n
 * catalogue under `pricing.units`, keyed by the same slugs, because this
 * string is UI copy. What is frozen onto the booking is whichever language
 * the customer actually read.
 */
export const UNIT_DECLARATIONS: Record<UnitType, { label: string; declaration: string }> = {
  sq_ft_face: {
    label: 'per sq ft — front face area',
    declaration:
      'Front face area (height × width of the visible surface). Internal shelves and partitions are not counted separately.',
  },
  sq_ft_developed: {
    label: 'per sq ft — developed area',
    declaration:
      'Developed area. Every internal shelf, partition and shutter is measured and counted, so the total area is larger than the visible front face.',
  },
  per_point: {
    label: 'per point',
    declaration:
      'One point is one fitting — a light, a fan, a switch or a socket — including the wiring run to it.',
  },
  per_running_ft: {
    label: 'per running ft',
    declaration: 'Running feet measured along the length of the work, regardless of its height.',
  },
  per_item: {
    label: 'per item',
    declaration: 'A fixed rate for each item of the same kind.',
  },
};

// ------------------------------------------------------------ society floor

export interface FloorCheck {
  ok: boolean;
  /** The floor that applies, when one does. */
  minimumRate?: number;
  societyName?: string;
}

/**
 * The floor that applies to one worker, for one category, mode and unit.
 *
 * A worker who is in no society has no floor — a solo hamali or an
 * independent driver prices themselves. That is not a loophole: the floor is
 * a promise a society makes to its own members, and a worker outside one has
 * nobody making it on their behalf.
 */
export async function floorFor(
  workerId: string,
  categorySlug: string,
  mode: PricingMode,
  unitType?: UnitType
): Promise<{ minimumRate: number; societyName: string } | null> {
  const society = await Mutha.findOne({ $or: [{ leaderId: workerId }, { memberIds: workerId }] })
    .select('_id name')
    .lean();
  if (!society) return null;

  const floor = await SocietyRateFloor.findOne({
    societyId: society._id,
    categorySlug,
    mode,
    ...(mode === 'per_unit' ? { unitType } : {}),
  }).lean();
  if (!floor) return null;

  return { minimumRate: floor.minimumRate, societyName: society.name };
}

export interface ProfileDraft {
  categorySlug: string;
  modesOffered: PricingMode[];
  hourly?: { rate: number; minimumBlockHours: number; travelIncluded: boolean };
  perUnit?: { unitType: UnitType; rate: number; minimumQuantity?: number; minutesPerUnit?: number; description?: string }[];
  perTask?: { taskName: string; description?: string; fixedPrice: number; estimatedDurationMinutes?: number }[];
  quotation?: { accepts: boolean; siteVisitFee: number; siteVisitAdjustable: boolean; typicalTurnaroundHours?: number };
}

/**
 * Rejects a draft that prices below the STATUTORY minimum wage.
 *
 * This is the floor that is not the cooperative's to set. A society's floor
 * is a promise its members made each other; this one is the Minimum Wages
 * Act, and a rate below it is unlawful whatever anyone has agreed.
 *
 * Only the hourly mode is checked, and that is a deliberate limit rather
 * than an oversight. A per-unit or per-task price has no honest hourly
 * equivalent: ₹400 to replace a hinge is not a ₹400 hourly rate, and it is
 * not a ₹1,200 one either, and the duration that would settle it is the one
 * thing nobody has measured. Enforcing against a made-up divisor would mean
 * refusing lawful rates on the strength of a guess. So the check covers the
 * mode where the comparison is real, and the disclosure shown to the
 * customer says which modes it covers rather than implying all of them.
 *
 * A worker in a state with no notification entered is not checked at all —
 * see wageFloor.service.ts.
 */
export async function assertStatutoryFloorForDraft(workerId: string, draft: ProfileDraft): Promise<void> {
  const worker = await User.findById(workerId).select('region').lean();
  const state = worker?.region ? await stateForRegion(worker.region) : null;
  if (!state) return;

  const skillBand = skillBandForCategory(draft.categorySlug);
  const zone = zoneForRegion(worker!.region!);
  const category = await ServiceCategory.findOne({ slug: draft.categorySlug }).select('defaultDurationMinutes').lean();
  const defaultMinutes = category?.defaultDurationMinutes && category.defaultDurationMinutes > 0 ? category.defaultDurationMinutes : 60;
  const check = (amount: number, label: string, conversion?: string) =>
    statutoryFloorProblem({ state, skillBand, zone, amount, unit: 'per_hour', label, conversion });

  const problems: (string | null)[] = [];

  if (draft.hourly?.rate) {
    problems.push(await check(draft.hourly.rate, 'Your hourly rate'));
  }

  // A fixed-price task is paid for the time it takes: the worker's own
  // estimate when they gave one, otherwise the category's default duration.
  for (const task of draft.perTask ?? []) {
    const minutes = task.estimatedDurationMinutes ?? defaultMinutes;
    const whose = task.estimatedDurationMinutes ? 'your estimate' : "this service's standard duration";
    problems.push(
      await check(
        perMinutesToHourly(task.fixedPrice, minutes),
        `"${task.taskName}" at ₹${task.fixedPrice}`,
        `₹${task.fixedPrice} for ${minutes} minutes, ${whose}`
      )
    );
  }

  // A per-unit rate needs a time per unit to be a wage at all. With the
  // worker's declared minutes per unit it converts directly; without it, the
  // smallest job they accept (minimum quantity × rate) is spread over the
  // service's standard duration — the least a customer can book them for.
  for (const line of draft.perUnit ?? []) {
    const label = `${UNIT_DECLARATIONS[line.unitType].label} rate ₹${line.rate}`;
    if (line.minutesPerUnit && line.minutesPerUnit > 0) {
      problems.push(
        await check(
          perMinutesToHourly(line.rate, line.minutesPerUnit),
          label,
          `₹${line.rate} per unit at your ${line.minutesPerUnit} minutes per unit`
        )
      );
    } else {
      const qty = line.minimumQuantity && line.minimumQuantity > 0 ? line.minimumQuantity : 1;
      const smallestJob = Math.round(line.rate * qty * 100) / 100;
      problems.push(
        await check(
          perMinutesToHourly(smallestJob, defaultMinutes),
          label,
          `smallest job ${qty} × ₹${line.rate} = ₹${smallestJob} over this service's standard ${defaultMinutes} minutes; declare minutes per unit for an exact check`
        )
      );
    }
  }

  const failures = problems.filter((x): x is string => !!x);
  if (failures.length > 0) {
    throw new ApiError(422, failures.join(' '), { reason: 'below_statutory_floor', failures });
  }
}

/**
 * Rejects a draft that prices below the worker's society floor.
 *
 * Enforced here, in the API, and NOT in the form — a UI check is a courtesy
 * and this is the mechanism that makes FYRO a fair-wage platform rather than
 * a race to the bottom. The error names the floor and the society, because
 * "rejected" without a number is unactionable.
 *
 * Deliberately rejects rather than clamping. Silently raising a worker's
 * published rate to the floor would put a price on the board that the worker
 * never chose, which is its own kind of dishonesty.
 */
export async function assertFloorsRespected(workerId: string, draft: ProfileDraft): Promise<void> {
  const failures: string[] = [];

  if (draft.hourly?.rate) {
    const floor = await floorFor(workerId, draft.categorySlug, 'hourly');
    if (floor && draft.hourly.rate < floor.minimumRate) {
      failures.push(
        `Hourly rate ₹${draft.hourly.rate} is below the ₹${floor.minimumRate} floor set by ${floor.societyName}`
      );
    }
  }

  for (const line of draft.perUnit ?? []) {
    const floor = await floorFor(workerId, draft.categorySlug, 'per_unit', line.unitType);
    if (floor && line.rate < floor.minimumRate) {
      failures.push(
        `${UNIT_DECLARATIONS[line.unitType].label} rate ₹${line.rate} is below the ₹${floor.minimumRate} floor set by ${floor.societyName}`
      );
    }
  }

  for (const task of draft.perTask ?? []) {
    const floor = await floorFor(workerId, draft.categorySlug, 'per_task');
    if (floor && task.fixedPrice < floor.minimumRate) {
      failures.push(
        `"${task.taskName}" at ₹${task.fixedPrice} is below the ₹${floor.minimumRate} floor set by ${floor.societyName}`
      );
    }
  }

  if (failures.length > 0) {
    throw new ApiError(422, failures.join('. '), { reason: 'below_society_floor', failures });
  }
}

/**
 * Re-checks every published profile in a society after its floor moves.
 *
 * Existing work is flagged, never rewritten: the worker is told to re-price,
 * and their rate stays theirs until they do. Returns how many profiles now
 * fall short, which is what the governance screen reports back to the leader
 * who just moved the floor.
 */
export async function reflagSocietyProfiles(societyId: string): Promise<number> {
  const society = await Mutha.findById(societyId).select('leaderId memberIds').lean();
  if (!society) return 0;

  const memberIds = [society.leaderId, ...(society.memberIds ?? [])].map(String);
  const profiles = await WorkerPricingProfile.find({ workerId: { $in: memberIds } });

  let flagged = 0;
  for (const profile of profiles) {
    let respected = true;
    try {
      await assertFloorsRespected(profile.workerId.toString(), {
        categorySlug: profile.categorySlug,
        modesOffered: profile.modesOffered,
        hourly: profile.hourly,
        perUnit: profile.perUnit,
        perTask: profile.perTask,
      });
    } catch {
      respected = false;
      flagged += 1;
    }
    if (profile.societyFloorRespected !== respected) {
      profile.societyFloorRespected = respected;
      await profile.save();
    }
  }
  return flagged;
}

// ------------------------------------------------------------- the pricing

export interface WorkFareBreakdown {
  mode: PricingMode;
  unitType?: UnitType;
  /** The rate the worker published, per hour / per unit, or the fixed price. */
  rate: number;
  quantity: number;
  /** Set when a minimum block or minimum quantity raised the billed quantity. */
  billedQuantity: number;
  minimumApplied: boolean;
  subtotal: number;
  total: number;
  unitDeclaration?: string;
}

export interface PriceWorkInput {
  profile: Pick<IWorkerPricingProfile, 'hourly' | 'perUnit' | 'perTask' | 'modesOffered'>;
  mode: PricingMode;
  unitType?: UnitType;
  quantity?: number;
  taskName?: string;
  /** For mode 'quotation': the accepted quotation's id. */
  quotationId?: string;
}

/**
 * Prices one job.
 *
 * Each mode has exactly one formula and no shared arithmetic, because they
 * genuinely are different things and a clever unified path would only make
 * the next reader guess:
 *
 *   hourly    rate × max(hours, minimum block)
 *   per_unit  rate × max(quantity, minimum quantity)
 *   per_task  the published fixed price, full stop
 *   quotation the frozen accepted total, never recomputed
 */
export async function priceWork(input: PriceWorkInput): Promise<WorkFareBreakdown> {
  const { profile, mode } = input;

  if (!profile.modesOffered.includes(mode)) {
    throw new ApiError(422, 'This worker does not offer that way of charging', { reason: 'mode_not_offered' });
  }

  if (mode === 'hourly') {
    const hourly = profile.hourly;
    if (!hourly?.rate) throw new ApiError(422, 'This worker has not published an hourly rate');
    const asked = Number(input.quantity ?? 0);
    if (!Number.isFinite(asked) || asked <= 0) throw new ApiError(400, 'How many hours?');
    const billed = Math.max(asked, hourly.minimumBlockHours);
    const subtotal = hourly.rate * billed;
    return {
      mode,
      rate: hourly.rate,
      quantity: asked,
      billedQuantity: billed,
      minimumApplied: billed > asked,
      subtotal: round2(subtotal),
      total: round2(subtotal),
    };
  }

  if (mode === 'per_unit') {
    if (!input.unitType) throw new ApiError(400, 'Which unit is this measured in?');
    const line = profile.perUnit.find((l) => l.unitType === input.unitType);
    if (!line) throw new ApiError(422, 'This worker has not published a rate in that unit');
    const asked = Number(input.quantity ?? 0);
    if (!Number.isFinite(asked) || asked <= 0) throw new ApiError(400, 'How much work is there?');
    const billed = Math.max(asked, line.minimumQuantity || 0);
    const subtotal = line.rate * billed;
    return {
      mode,
      unitType: line.unitType,
      rate: line.rate,
      quantity: asked,
      billedQuantity: billed,
      minimumApplied: billed > asked,
      subtotal: round2(subtotal),
      total: round2(subtotal),
      unitDeclaration: UNIT_DECLARATIONS[line.unitType].declaration,
    };
  }

  if (mode === 'per_task') {
    const task = profile.perTask.find((t) => t.taskName === input.taskName);
    if (!task) throw new ApiError(422, 'This worker does not list that task');
    return {
      mode,
      rate: task.fixedPrice,
      quantity: 1,
      billedQuantity: 1,
      minimumApplied: false,
      subtotal: round2(task.fixedPrice),
      total: round2(task.fixedPrice),
    };
  }

  // quotation — the price was agreed, in writing, at acceptance. This path
  // reads it and must never recalculate it from line items: a rate that
  // changed after acceptance would otherwise quietly move a number the
  // customer already signed off.
  if (!input.quotationId) throw new ApiError(400, 'Which quotation?');
  const quotation = await Quotation.findById(input.quotationId).select('status frozenTotal').lean();
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  if (quotation.status !== 'accepted' || quotation.frozenTotal === undefined) {
    throw new ApiError(422, 'That quotation has not been accepted yet');
  }
  return {
    mode,
    rate: quotation.frozenTotal,
    quantity: 1,
    billedQuantity: 1,
    minimumApplied: false,
    subtotal: quotation.frozenTotal,
    total: quotation.frozenTotal,
  };
}

// ----------------------------------------------------- itemised for humans

export interface PriceDisclosure {
  /** The worker's rate for this job — all of which the worker keeps (P1.1). */
  total: number;
  /** P1.1 — added on top of the worker's rate and paid by the customer. */
  serviceFee: number;
  serviceFeePct: number;
  /** What the customer pays: total + serviceFee. */
  customerTotal: number;
  /** Where the service fee goes, in rupees, exactly as settlement will post it. */
  feeParts: { society: number; welfarePool: number; guaranteeReserve: number; platform: number };
  feeSplit: { societyPct: number; welfarePoolPct: number; guaranteeReservePct: number; platformPct: number };
  /** Deprecated (always 0 since P1.1): nothing is deducted from the worker any more. */
  platformFee: number;
  platformRatePct: number;
  societyReserve: number;
  societyWelfare: number;
  societyRatePct: number;
  welfareRatePct: number;
  workerTakeHome: number;
  societyName?: string;
  /**
   * The statutory floor this worker's rate was checked against, when their
   * state has one published. Present so the customer can see the claim is
   * attached to an instrument with a number, rather than reading a badge.
   * Absent for a state whose notification has not been entered — in which
   * case the screen says nothing rather than implying a check happened.
   */
  statutoryFloor?: {
    state: string;
    zone: string;
    skillBand: string;
    monthlyRate: number;
    dailyRate: number;
    hourlyRate: number;
    workingDaysPerMonth: number;
    workingHoursPerDay: number;
    notificationNumber: string;
    scheduledEmployment: string;
    sourceType: string;
    sourceUrl?: string;
    notificationDate?: Date;
    /** The notification has lapsed; its rate is still enforced until a new one is entered. */
    stale: boolean;
  };
}

/**
 * Every rupee, named, before the customer confirms.
 *
 * Since P1.1 nothing is deducted from the worker: the customer pays the
 * worker's rate plus a published service fee, and this says exactly where
 * each part of that fee goes — computed by the same functions settlement
 * uses, so the promise on screen is the posting in the ledger.
 */
export async function disclosePrice(total: number, workerId: string, split: FeeSplit, categorySlug?: string): Promise<PriceDisclosure> {
  const society = await Mutha.findOne({ $or: [{ leaderId: workerId }, { memberIds: workerId }] })
    .select('name')
    .lean();

  const priced = withServiceFee({ baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: total, total }, split);
  const serviceFee = priced.serviceFee ?? 0;
  const feeParts = splitServiceFee(serviceFee, split);

  const worker = await User.findById(workerId).select('region').lean();
  const state = worker?.region ? await stateForRegion(worker.region) : null;
  const floor = state
    ? await wageFloorFor(state, skillBandForCategory(categorySlug), zoneForRegion(worker!.region!))
    : null;

  return {
    total: round2(total),
    serviceFee,
    serviceFeePct: split.feeTotalPct,
    customerTotal: priced.total,
    feeParts,
    feeSplit: {
      societyPct: split.societyPct,
      welfarePoolPct: split.welfarePoolPct,
      guaranteeReservePct: split.guaranteeReservePct,
      platformPct: split.platformPct,
    },
    platformFee: 0,
    platformRatePct: 0,
    societyReserve: 0,
    societyWelfare: 0,
    societyRatePct: 0,
    welfareRatePct: 0,
    workerTakeHome: round2(total),
    societyName: society?.name,
    ...(floor
      ? {
          statutoryFloor: {
            state: floor.state,
            zone: floor.zone,
            skillBand: floor.skillBand,
            monthlyRate: floor.monthlyRate,
            dailyRate: floor.dailyRate,
            hourlyRate: floor.hourlyRate,
            workingDaysPerMonth: floor.workingDaysPerMonth,
            workingHoursPerDay: floor.workingHoursPerDay,
            notificationNumber: floor.notificationNumber,
            scheduledEmployment: floor.scheduledEmployment,
            sourceType: floor.sourceType,
            sourceUrl: floor.sourceUrl,
            notificationDate: floor.notificationDate,
            stale: floor.stale,
          },
        }
      : {}),
  };
}
