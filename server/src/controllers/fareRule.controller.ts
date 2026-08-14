import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
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

  const fareRule = await FareRule.create({
    region,
    category,
    baseFare,
    perKmRate,
    minimumFare,
    surgeMultiplier: 1.0,
    setByAdminId: req.user!.id,
    active: true,
  });

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

export const updateFareRule = asyncHandler(async (req: Request, res: Response) => {
  const fareRule = await FareRule.findById(req.params.id);
  if (!fareRule) throw new ApiError(404, 'Fare rule not found');

  const before = fareRule.toObject();
  const { baseFare, perKmRate, minimumFare, active } = req.body;
  if (baseFare !== undefined) fareRule.baseFare = baseFare;
  if (perKmRate !== undefined) fareRule.perKmRate = perKmRate;
  if (minimumFare !== undefined) fareRule.minimumFare = minimumFare;
  if (active !== undefined) fareRule.active = active;
  await fareRule.save();

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
