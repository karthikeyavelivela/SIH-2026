import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { FareRule } from '../models/FareRule';
import { writeAuditLog } from '../services/audit.service';

export const listFareRules = asyncHandler(async (req: Request, res: Response) => {
  const { region, category } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (region) filter.region = region;
  if (category) filter.category = category;

  const fareRules = await FareRule.find(filter).sort({ region: 1, category: 1 });
  res.status(200).json({ fareRules });
});

export const createFareRule = asyncHandler(async (req: Request, res: Response) => {
  const { region, category, baseFare, perKmRate, minimumFare } = req.body;

  // Task 6's findActiveRule() looks up FareRule.findOne({region, category,
  // active:true}) and assumes at most one intended active rule per
  // region+category. Without this, a second POST for the same
  // region+category (e.g. an admin "fixing a typo" by creating a new row
  // instead of PATCHing) would silently leave two active rows — Task 6
  // would pick one by effectiveFrom with no signal anything's wrong, and
  // the orphaned duplicate would linger in listFareRules forever. So:
  // creating a new active rule for a region+category retires any existing
  // one first.
  //
  // This sequential supersede-then-create is NOT atomic across the pair —
  // two near-simultaneous requests can both pass the findOneAndUpdate step
  // before either create() lands. The actual guarantee comes from the
  // partial unique index on FareRule ({region,category}, active:true only,
  // see FareRule.ts) — the DB itself rejects a second concurrent active
  // row with an E11000 error, which the catch block below turns into a
  // clean 409 instead of a raw 500. The application-level supersede step
  // handles the common sequential case cleanly (with an audit trail);
  // the index is the real backstop for the race.
  const superseded = await FareRule.findOneAndUpdate(
    { region, category, active: true },
    { active: false },
    { new: true }
  );
  if (superseded) {
    await writeAuditLog({
      actorId: req.user!.id,
      actorRole: req.user!.role,
      action: 'fare_rule_superseded',
      targetType: 'FareRule',
      targetId: superseded._id.toString(),
      details: { region, category, reason: 'replaced by a new active fare rule for the same region/category' },
    });
  }

  let fareRule;
  try {
    fareRule = await FareRule.create({
      region,
      category,
      baseFare,
      perKmRate,
      minimumFare,
      surgeMultiplier: 1.0,
      setByAdminId: req.user!.id,
      active: true,
    });
  } catch (err) {
    rethrowAsConflict(err, `An active fare rule for ${region}/${category}`);
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'fare_rule_created',
    targetType: 'FareRule',
    targetId: fareRule._id.toString(),
    details: { region, category, baseFare, perKmRate, minimumFare },
  });

  res.status(201).json({ fareRule });
});

// NOTE on effectiveFrom: this endpoint mutates a FareRule in place — it
// does NOT bump effectiveFrom or version the rule into a new row. That's a
// deliberate scope decision, not an oversight: Booking.fareBreakdown
// snapshots the computed total onto the booking document at creation time
// (see booking.controller.ts), so an in-place rate edit can never
// retroactively change what an already-placed booking was charged.
// effectiveFrom exists on the model for a future scheduled-rate-change /
// rate-history feature that this CRUD does not implement — if that's ever
// needed, updateFareRule should create a new row and deactivate the old one
// (the same pattern createFareRule already uses to supersede a prior active
// rule) rather than mutating fields on the existing document.
export const updateFareRule = asyncHandler(async (req: Request, res: Response) => {
  const fareRule = await FareRule.findById(req.params.id);
  if (!fareRule) throw new ApiError(404, 'Fare rule not found');

  const before = fareRule.toObject();
  const { baseFare, perKmRate, minimumFare, active } = req.body;
  if (baseFare !== undefined) fareRule.baseFare = baseFare;
  if (perKmRate !== undefined) fareRule.perKmRate = perKmRate;
  if (minimumFare !== undefined) fareRule.minimumFare = minimumFare;
  if (active !== undefined) fareRule.active = active;
  try {
    await fareRule.save();
  } catch (err) {
    // Reactivating (active:false -> true) a rule can collide with the
    // partial unique index if another rule for the same region+category
    // is already active — same DB-layer backstop as createFareRule.
    rethrowAsConflict(err, `An active fare rule for ${fareRule.region}/${fareRule.category}`);
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'fare_rule_updated',
    targetType: 'FareRule',
    targetId: fareRule._id.toString(),
    details: { before, after: fareRule.toObject() },
  });

  res.status(200).json({ fareRule });
});
