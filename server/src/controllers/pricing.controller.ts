import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { WorkerPricingProfile } from '../models/WorkerPricingProfile';
import { SocietyRateFloor } from '../models/SocietyRateFloor';
import { Mutha } from '../models/Mutha';
import { User } from '../models/User';
import { HamaliProfile } from '../models/HamaliProfile';
import {
  assertFloorsRespected,
  assertStatutoryFloorForDraft,
  floorFor,
  priceWork,
  disclosePrice,
  reflagSocietyProfiles,
  UNIT_DECLARATIONS,
  type ProfileDraft,
} from '../services/workPricing.service';
import { getPlatformCommissionPct } from '../services/platformCommission.service';
import {
  assertAtOrAboveStatutoryFloor,
  skillBandForCategory,
  stateForRegion,
  zoneForRegion,
} from '../services/wageFloor.service';
import { writeAuditLog } from '../services/audit.service';
import { guideFor } from '../services/taskCatalogue';
import type { PricingMode, UnitType } from '@fyro/shared';
import { getFeeSplit } from '../services/serviceFee.service';

/**
 * Work-based pricing: publishing rates, reading them, and quoting from them.
 *
 * The split of trust here is the same one the rest of this codebase uses: a
 * worker may write only their own profile, a society leader may write only
 * their own society's floors, and a customer may read published rates and ask
 * for a price — but the price always comes back computed, never accepted.
 */

// ------------------------------------------------------------ worker side

export const getMyPricing = asyncHandler(async (req: Request, res: Response) => {
  const profiles = await WorkerPricingProfile.find({ workerId: req.user!.id }).lean();
  res.status(200).json({ profiles });
});

export const upsertMyPricing = asyncHandler(async (req: Request, res: Response) => {
  const workerId = req.user!.id;
  const draft = req.body as ProfileDraft;

  // Both floors are enforced before anything is written, so there is no
  // window in which an unlawful or below-floor rate is published. The
  // statutory one goes first: a rate can be above every society's floor and
  // still be below the minimum wage, and that is the more serious of the
  // two failures.
  await assertStatutoryFloorForDraft(workerId, draft);
  await assertFloorsRespected(workerId, draft);

  const profile = await WorkerPricingProfile.findOneAndUpdate(
    { workerId, categorySlug: draft.categorySlug },
    {
      $set: {
        modesOffered: draft.modesOffered,
        hourly: draft.hourly,
        perUnit: draft.perUnit ?? [],
        perTask: draft.perTask ?? [],
        quotation: draft.quotation,
        societyFloorRespected: true,
        active: true,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  await writeAuditLog({
    actorId: workerId,
    actorRole: req.user!.role,
    action: 'pricing_profile_published',
    targetType: 'WorkerPricingProfile',
    targetId: profile._id.toString(),
    details: { categorySlug: draft.categorySlug, modes: draft.modesOffered },
  });

  res.status(200).json({ profile });
});

/** The floors that apply to the calling worker, so the form can show them. */
export const getMyFloors = asyncHandler(async (req: Request, res: Response) => {
  const { categorySlug } = req.query as { categorySlug?: string };
  if (!categorySlug) throw new ApiError(400, 'categorySlug is required');

  const modes: PricingMode[] = ['hourly', 'per_task'];
  const floors: Record<string, { minimumRate: number; societyName: string } | null> = {};
  for (const mode of modes) {
    floors[mode] = await floorFor(req.user!.id, categorySlug, mode);
  }
  for (const unitType of Object.keys(UNIT_DECLARATIONS) as UnitType[]) {
    floors[`per_unit:${unitType}`] = await floorFor(req.user!.id, categorySlug, 'per_unit', unitType);
  }

  res.status(200).json({ floors });
});

// ----------------------------------------------------------- society side

export const listSocietyFloors = asyncHandler(async (req: Request, res: Response) => {
  const society = await Mutha.findOne({
    $or: [{ leaderId: req.user!.id }, { memberIds: req.user!.id }],
  })
    .select('_id name')
    .lean();
  if (!society) throw new ApiError(404, 'No society found for this account');

  const floors = await SocietyRateFloor.find({ societyId: society._id }).sort({ categorySlug: 1 }).lean();
  res.status(200).json({ societyName: society.name, floors });
});

export const setSocietyFloor = asyncHandler(async (req: Request, res: Response) => {
  const leaderId = req.user!.id;
  const { categorySlug, mode, unitType, minimumRate } = req.body as {
    categorySlug: string;
    mode: PricingMode;
    unitType?: UnitType;
    minimumRate: number;
  };

  const society = await Mutha.findOne({ leaderId }).select('_id region').lean();
  if (!society) throw new ApiError(404, 'No society found for this leader');

  if (mode === 'per_unit' && !unitType) {
    throw new ApiError(400, 'A per-unit floor has to say which unit it applies to');
  }

  // A society floor is a promise, so it must not be a promise to underpay.
  // An hourly floor set below the statutory minimum would have every member
  // publishing a lawful-looking rate that is not, so it is refused here,
  // before the floor exists. Same limit as the worker check: only the hourly
  // mode has an honest hourly equivalent.
  if (mode === 'hourly' && society.region) {
    const state = await stateForRegion(society.region);
    if (state) {
      await assertAtOrAboveStatutoryFloor({
        state,
        skillBand: skillBandForCategory(categorySlug),
        amount: minimumRate,
        unit: 'per_hour',
        zone: zoneForRegion(society.region),
        label: 'That floor',
      });
    }
  }

  const floor = await SocietyRateFloor.findOneAndUpdate(
    { societyId: society._id, categorySlug, mode, unitType: mode === 'per_unit' ? unitType : undefined },
    { $set: { minimumRate, setByLeaderId: leaderId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // Members who published below the new floor are flagged, not rewritten —
  // their rate stays theirs until they choose a new one.
  const flagged = await reflagSocietyProfiles(society._id.toString());

  await writeAuditLog({
    actorId: leaderId,
    actorRole: req.user!.role,
    action: 'society_rate_floor_set',
    targetType: 'SocietyRateFloor',
    targetId: floor._id.toString(),
    details: { categorySlug, mode, unitType, minimumRate, membersNowBelowFloor: flagged },
  });

  res.status(200).json({ floor, membersNowBelowFloor: flagged });
});

// ---------------------------------------------------------- customer side

/**
 * Who does this trade, and how do they charge.
 *
 * Only published, active profiles whose rates still clear their society's
 * floor are listed: a profile flagged by a floor rise is withheld until the
 * worker re-prices, rather than shown at a rate their own society has since
 * disowned.
 */
export const listWorkersForCategory = asyncHandler(async (req: Request, res: Response) => {
  const { categorySlug, mode } = req.query as { categorySlug?: string; mode?: PricingMode };
  if (!categorySlug) throw new ApiError(400, 'categorySlug is required');

  const profiles = await WorkerPricingProfile.find({
    categorySlug,
    active: true,
    societyFloorRespected: true,
    ...(mode ? { modesOffered: mode } : {}),
  })
    .limit(50)
    .lean();

  const workerIds = profiles.map((p) => p.workerId);
  const [workers, hamaliProfiles] = await Promise.all([
    User.find({ _id: { $in: workerIds } }).select('name ratingAvg ratingCount region').lean(),
    HamaliProfile.find({ userId: { $in: workerIds } }).select('userId skills availabilityStatus').lean(),
  ]);
  const workerById = new Map(workers.map((w) => [w._id.toString(), w]));
  const skillsById = new Map(hamaliProfiles.map((h) => [h.userId.toString(), h]));

  res.status(200).json({
    workers: profiles
      .map((p) => {
        const worker = workerById.get(p.workerId.toString());
        if (!worker) return null;
        const skills = skillsById.get(p.workerId.toString());
        return {
          workerId: p.workerId.toString(),
          name: worker.name,
          ratingAvg: worker.ratingAvg,
          ratingCount: worker.ratingCount,
          region: worker.region,
          availabilityStatus: skills?.availabilityStatus,
          modesOffered: p.modesOffered,
          hourly: p.hourly,
          perUnit: p.perUnit,
          perTask: p.perTask,
          quotation: p.quotation,
        };
      })
      .filter(Boolean),
  });
});

/**
 * What one job would cost, itemised down to the worker's take-home.
 *
 * Never a bare total: the response carries the platform's disclosed
 * commission, the society's reserve and welfare cuts, and what the worker
 * actually keeps — because a customer being able to see that is the whole
 * argument for a cooperative platform over an aggregator.
 */
export const quoteWork = asyncHandler(async (req: Request, res: Response) => {
  const { workerId, categorySlug, mode, unitType, quantity, taskName, quotationId } = req.body as {
    workerId: string;
    categorySlug: string;
    mode: PricingMode;
    unitType?: UnitType;
    quantity?: number;
    taskName?: string;
    quotationId?: string;
  };

  const profile = await WorkerPricingProfile.findOne({ workerId, categorySlug, active: true }).lean();
  if (!profile) throw new ApiError(404, 'This worker has not published rates for that service');

  const fare = await priceWork({ profile, mode, unitType, quantity, taskName, quotationId });
  const disclosure = await disclosePrice(fare.total, workerId, await getFeeSplit(), categorySlug);

  res.status(200).json({ fare, disclosure });
});

/**
 * What this trade usually charges for, and roughly what it charges.
 *
 * Guidance for the worker filling in the form — never shown to a customer as
 * a market rate. A customer only ever sees a number some specific worker
 * actually published.
 */
export const getCategoryGuide = asyncHandler(async (req: Request, res: Response) => {
  const categorySlug = String(req.query.categorySlug ?? '');
  if (!categorySlug) throw new ApiError(400, 'categorySlug is required');
  res.status(200).json({ guide: guideFor(categorySlug) });
});

/** The controlled list, with the exact declaration each unit carries. */
export const getUnitDeclarations = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ units: UNIT_DECLARATIONS });
});
