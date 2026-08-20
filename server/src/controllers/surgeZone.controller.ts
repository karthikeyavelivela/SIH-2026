import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { SurgeZone, MAX_SURGE_MULTIPLIER } from '../models/SurgeZone';
import { writeAuditLog } from '../services/audit.service';

/** GET /api/admin/surge-zones — active zones (expiresAt in the future) plus recent expired ones for context. */
export const listSurgeZones = asyncHandler(async (_req: Request, res: Response) => {
  const now = new Date();
  const [active, recentExpired] = await Promise.all([
    SurgeZone.find({ expiresAt: { $gt: now } }).sort({ expiresAt: 1 }),
    SurgeZone.find({ expiresAt: { $lte: now } })
      .sort({ expiresAt: -1 })
      .limit(20),
  ]);
  res.status(200).json({ active, recentExpired, maxMultiplier: MAX_SURGE_MULTIPLIER });
});

/** POST /api/admin/surge-zones — manual override: region name + multiplier (capped) + duration. */
export const createSurgeZone = asyncHandler(async (req: Request, res: Response) => {
  const { name, multiplier, durationMinutes } = req.body as {
    name: string;
    multiplier: number;
    durationMinutes: number;
  };

  if (multiplier > MAX_SURGE_MULTIPLIER) {
    throw new ApiError(400, `Multiplier cannot exceed ${MAX_SURGE_MULTIPLIER}x`);
  }

  const expiresAt = new Date(Date.now() + durationMinutes * 60_000);
  const zone = await SurgeZone.create({
    name,
    multiplier,
    expiresAt,
    isManual: true,
    createdBy: req.user!.id,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'surge_zone_created',
    targetType: 'SurgeZone',
    targetId: zone._id.toString(),
    details: { name, multiplier, expiresAt },
  });

  res.status(201).json({ zone });
});

/** PATCH /api/admin/surge-zones/:id/end — ends a manual override immediately. */
export const endSurgeZone = asyncHandler(async (req: Request, res: Response) => {
  const zone = await SurgeZone.findById(req.params.id);
  if (!zone) throw new ApiError(404, 'Surge zone not found');
  zone.expiresAt = new Date();
  await zone.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'surge_zone_ended',
    targetType: 'SurgeZone',
    targetId: zone._id.toString(),
  });

  res.status(200).json({ zone });
});
