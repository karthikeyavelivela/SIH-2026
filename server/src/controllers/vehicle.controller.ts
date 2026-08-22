import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Vehicle } from '../models/Vehicle';

/** GET /api/vehicles/me — the calling driver's own vehicle (profile screen). */
export const getMyVehicle = asyncHandler(async (req: Request, res: Response) => {
  const vehicle = await Vehicle.findOne({ ownerId: req.user!.id });
  if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
  res.status(200).json({ vehicle });
});

/**
 * PATCH /api/vehicles/me — Phase 2. Previously only GET existed: a
 * driver's "vehicle management" profile section had nothing to actually
 * manage. capacityKg/type are editable directly; registrationNumber is
 * deliberately NOT (it's the KYC-adjacent legal identity of the vehicle —
 * changing it should go through re-verification, not a plain profile
 * edit, matching how KYC documents already work). Editing either field
 * resets `verified` to false — an admin should re-confirm a vehicle whose
 * declared type/capacity just changed, same reasoning as the KYC
 * re-review-on-change behavior in kycDocument.controller.ts.
 */
export const updateMyVehicle = asyncHandler(async (req: Request, res: Response) => {
  const { type, capacityKg, photos } = req.body as { type?: string; capacityKg?: number; photos?: string[] };

  const update: Record<string, unknown> = {};
  if (type !== undefined) update.type = type;
  if (capacityKg !== undefined) update.capacityKg = capacityKg;
  if (photos !== undefined) update.photos = photos;
  if (type !== undefined || capacityKg !== undefined) update.verified = false;

  const vehicle = await Vehicle.findOneAndUpdate({ ownerId: req.user!.id }, update, { new: true });
  if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
  res.status(200).json({ vehicle });
});
