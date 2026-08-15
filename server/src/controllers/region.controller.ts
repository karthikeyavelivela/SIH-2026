import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { Region } from '../models/Region';
import { writeAuditLog } from '../services/audit.service';

export const listRegions = asyncHandler(async (_req: Request, res: Response) => {
  const regions = await Region.find().sort({ name: 1 });
  res.status(200).json({ regions });
});

export const launchRegion = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  let region;
  try {
    region = await Region.create({ name, enabled: true, launchedByAdminId: req.user!.id });
  } catch (err) {
    rethrowAsConflict(err, `Region "${name}"`);
  }
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'region_launched',
    targetType: 'Region',
    targetId: region._id.toString(),
    details: { name },
  });
  res.status(201).json({ region });
});

export const setRegionEnabled = asyncHandler(async (req: Request, res: Response) => {
  const { enabled } = req.body;
  const region = await Region.findByIdAndUpdate(req.params.id, { enabled }, { new: true });
  if (!region) throw new ApiError(404, 'Region not found');
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: enabled ? 'region_enabled' : 'region_disabled',
    targetType: 'Region',
    targetId: region._id.toString(),
  });
  res.status(200).json({ region });
});
