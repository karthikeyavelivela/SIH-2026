import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';

export const setAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { status, location } = req.body;

  if (status === 'online' && !location) {
    throw new ApiError(400, 'A location is required to go online');
  }

  const update: Record<string, unknown> = { availabilityStatus: status };
  if (location) {
    update.currentLocation = { type: 'Point', coordinates: [location.lng, location.lat] };
  }

  if (req.user!.role === 'driver') {
    const vehicle = await Vehicle.findOneAndUpdate({ ownerId: req.user!.id }, update, { new: true });
    if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
    res.status(200).json({ availabilityStatus: vehicle.availabilityStatus });
    return;
  }

  if (req.user!.role === 'hamali_solo' || req.user!.role === 'mutha_leader') {
    // Mutha leaders don't have their own HamaliProfile in Phase 1's scope
    // (they're group admins, not laborers) — treat leader availability as
    // "the group is accepting requests" by updating on their own behalf
    // only if a profile exists; otherwise this is a no-op success for
    // leaders until Phase 2's mutha-leader flow needs its own state.
    const profile = await HamaliProfile.findOneAndUpdate({ userId: req.user!.id }, update, { new: true });
    if (!profile && req.user!.role === 'hamali_solo') {
      throw new ApiError(404, 'No hamali profile found for this user');
    }
    res.status(200).json({ availabilityStatus: profile?.availabilityStatus ?? status });
    return;
  }

  throw new ApiError(403, 'This role does not have an availability toggle');
});
