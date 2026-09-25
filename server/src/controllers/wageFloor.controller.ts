import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import {
  GovernmentWageFloor,
  SkillBand,
  WageZone,
  DEFAULT_WORKING_DAYS_PER_MONTH,
  DEFAULT_WORKING_HOURS_PER_DAY,
} from '../models/GovernmentWageFloor';
import {
  CATEGORY_SKILL_BANDS,
  compareToFloor,
  deriveRates,
  skillBandForCategory,
  stateForRegion,
  zoneForRegion,
  sourceLine,
} from '../services/wageFloor.service';
import { staleFloorStates } from '../services/wageFloorAlerts.service';
import { writeAuditLog } from '../services/audit.service';

/**
 * The statutory wage floors, read by anyone and written only by an admin.
 *
 * Read access is open to every signed-in role on purpose. A floor that only
 * the platform can see is not a fair-wage guarantee, it is a claim — the
 * worker whose rate it governs and the customer paying the bill both have
 * a reason to check the figure, the divisors and the notification it came
 * from. Writing is admin-only with no manager carve-out, the same posture
 * as fare rules and the platform commission.
 */

/** GET /api/wage-floors — the published floors, newest notification first. */
export const listWageFloors = asyncHandler(async (req: Request, res: Response) => {
  const { state, zone } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = { active: true };
  if (state) filter.state = state;
  if (zone) filter.zone = zone;

  const floors = await GovernmentWageFloor.find(filter)
    .sort({ state: 1, zone: 1, monthlyRate: 1 })
    .lean();

  res.status(200).json({
    floors,
    // The mapping is part of the answer: a worker looking at a floor needs
    // to know which band their trade was put in, and by whom.
    categorySkillBands: CATEGORY_SKILL_BANDS,
  });
});

/**
 * GET /api/wage-floors/applicable?region=&categorySlug=
 *
 * The one floor that governs a given piece of work, with the whole working
 * shown — monthly, the divisors, daily, hourly — so a screen can print the
 * derivation rather than asserting an hourly figure the government never
 * published.
 */
export const getApplicableFloor = asyncHandler(async (req: Request, res: Response) => {
  const { region, categorySlug } = req.query as Record<string, string>;
  if (!region) throw new ApiError(400, 'region is required');

  const state = await stateForRegion(region);
  if (!state) {
    // Not an error. FYRO serves six states and only the ones whose
    // notification has been entered have a floor.
    res.status(200).json({ floor: null, state: null, reason: 'region_not_in_a_known_state' });
    return;
  }

  const skillBand = skillBandForCategory(categorySlug);
  const zone = zoneForRegion(region);
  const comparison = await compareToFloor(state, skillBand, 0, 'per_hour', zone);
  if (!comparison) {
    res.status(200).json({ floor: null, state, skillBand, zone, reason: 'no_notification_for_state' });
    return;
  }

  res.status(200).json({
    floor: comparison.floor,
    stale: comparison.floor.stale,
    source: sourceLine(comparison.floor),
    state,
    skillBand,
    zone,
  });
});

/**
 * GET /api/admin/wage-floors — every row, retired ones included, each with
 * whether it is in force today. History matters here: "what was the floor
 * last April" is the question a wage dispute turns on.
 */
export const adminListWageFloors = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const rows = await GovernmentWageFloor.find({}).sort({ state: 1, zone: 1, skillBand: 1, effectiveFrom: -1 }).lean();
  const floors = rows.map((f) => ({
    ...f,
    source: sourceLine(f),
    status: !f.active
      ? 'retired'
      : f.effectiveFrom > now
        ? 'scheduled'
        : f.effectiveUntil && f.effectiveUntil < now
          ? 'stale'
          : 'in_force',
  }));
  res.status(200).json({ floors, staleStates: await staleFloorStates(now) });
});

/**
 * PATCH /api/admin/wage-floors/:id/deactivate — withdraw a floor entered in
 * error. Retired, never deleted; audited with the reason.
 */
export const deactivateWageFloor = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body as { reason: string };
  const floor = await GovernmentWageFloor.findOneAndUpdate({ _id: req.params.id, active: true }, { active: false }, { new: true });
  if (!floor) throw new ApiError(404, 'No active wage floor with that id');
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'wage_floor_deactivated',
    targetType: 'GovernmentWageFloor',
    targetId: floor._id.toString(),
    details: { state: floor.state, zone: floor.zone, skillBand: floor.skillBand, notificationNumber: floor.notificationNumber, reason },
  });
  res.status(200).json({ floor });
});

interface FloorBody {
  state: string;
  zone: WageZone;
  skillBand: SkillBand;
  monthlyRate: number;
  basicComponent?: number;
  vdaComponent?: number;
  workingDaysPerMonth?: number;
  workingHoursPerDay?: number;
  scheduledEmployment: string;
  notificationNumber: string;
  notificationDate: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  sourceType: 'gazette' | 'department_website' | 'secondary_compilation';
  sourceUrl?: string;
  sourceNote?: string;
}

/**
 * POST /api/admin/wage-floors — publish a floor from a new notification.
 *
 * Supersedes rather than overwrites. "What was the floor last April" is a
 * question a wage dispute turns on, so the old row is retired, not deleted,
 * and both the retirement and the new row are audit-logged.
 *
 * The daily and hourly figures are DERIVED here and not accepted from the
 * caller, so a typo in one of them cannot become the number the platform
 * enforces. The divisors are stored with the row so the derivation can be
 * shown and argued with.
 */
export const createWageFloor = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as FloorBody;
  const workingDaysPerMonth = body.workingDaysPerMonth ?? DEFAULT_WORKING_DAYS_PER_MONTH;
  const workingHoursPerDay = body.workingHoursPerDay ?? DEFAULT_WORKING_HOURS_PER_DAY;
  const { dailyRate, hourlyRate } = deriveRates(body.monthlyRate, workingDaysPerMonth, workingHoursPerDay);

  const superseded = await GovernmentWageFloor.findOneAndUpdate(
    { state: body.state, zone: body.zone, skillBand: body.skillBand, active: true },
    { active: false },
    { new: true }
  );
  if (superseded) {
    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'wage_floor_superseded',
      targetType: 'GovernmentWageFloor',
      targetId: superseded._id.toString(),
      details: {
        state: body.state,
        zone: body.zone,
        skillBand: body.skillBand,
        previousMonthlyRate: superseded.monthlyRate,
        previousNotification: superseded.notificationNumber,
      },
    });
  }

  let floor;
  try {
    floor = await GovernmentWageFloor.create({
      state: body.state,
      zone: body.zone,
      skillBand: body.skillBand,
      monthlyRate: body.monthlyRate,
      basicComponent: body.basicComponent,
      vdaComponent: body.vdaComponent,
      dailyRate,
      hourlyRate,
      workingDaysPerMonth,
      workingHoursPerDay,
      scheduledEmployment: body.scheduledEmployment,
      notificationNumber: body.notificationNumber,
      notificationDate: new Date(body.notificationDate),
      effectiveFrom: new Date(body.effectiveFrom),
      effectiveUntil: body.effectiveUntil ? new Date(body.effectiveUntil) : undefined,
      sourceType: body.sourceType,
      sourceUrl: body.sourceUrl,
      sourceNote: body.sourceNote,
      setByAdminId: req.user!.id,
      active: true,
    });
  } catch (err) {
    // The partial unique index is the real backstop for two concurrent
    // publishes — same pattern and same reasoning as FareRule.
    rethrowAsConflict(err, 'An active wage floor already exists for that state, zone and skill band');
    throw err;
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'wage_floor_published',
    targetType: 'GovernmentWageFloor',
    targetId: floor._id.toString(),
    details: {
      state: floor.state,
      zone: floor.zone,
      skillBand: floor.skillBand,
      monthlyRate: floor.monthlyRate,
      dailyRate: floor.dailyRate,
      hourlyRate: floor.hourlyRate,
      notificationNumber: floor.notificationNumber,
      sourceType: floor.sourceType,
    },
  });

  res.status(201).json({ floor });
});
