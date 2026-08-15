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
