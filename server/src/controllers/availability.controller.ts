import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { User } from '../models/User';
import { outstandingKycDocs, kycGateMessage } from '../services/kyc.service';

const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

// Mongoose materializes a "plain nested object" schema path (the
// {type, coordinates} GeoPoint shape used throughout this codebase) as an
// empty {} on every document that never explicitly set it — never
// undefined/null, even with no defaults on either child field. `doc.field
// ?? null` never catches that, so every caller of willingLocation needs
// this instead of a bare nullish check.
function presentGeoPoint(
  point: { type?: string; coordinates?: number[] } | undefined
): { type: 'Point'; coordinates: [number, number] } | null {
  if (!point?.coordinates || point.coordinates.length !== 2) return null;
  return { type: 'Point', coordinates: [point.coordinates[0], point.coordinates[1]] };
}

/**
 * GET /api/availability — the caller's own current status, so a client
 * (e.g. the dashboard's online/offline toggle) can render the real state
 * on load instead of assuming 'offline' and silently lying to the user
 * for the first render, or worse, letting them flip a toggle that's
 * actually already in the state they think they're switching to.
 */
export const getAvailability = asyncHandler(async (req: Request, res: Response) => {
  if (req.user!.role === 'driver') {
    const vehicle = await Vehicle.findOne({ ownerId: req.user!.id });
    if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
    res.status(200).json({
      availabilityStatus: vehicle.availabilityStatus,
      willingLocation: presentGeoPoint(vehicle.willingLocation),
    });
    return;
  }
  if (req.user!.role === 'hamali_solo' || req.user!.role === 'mutha_member') {
    const profile = await HamaliProfile.findOne({ userId: req.user!.id });
    if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
    res.status(200).json({
      availabilityStatus: profile.availabilityStatus,
      willingLocation: presentGeoPoint(profile.willingLocation),
    });
    return;
  }
  throw new ApiError(403, 'This role does not have an availability toggle');
});

export const setAvailability = asyncHandler(async (req: Request, res: Response) => {
  const { status, location } = req.body;

  if (status === 'online' && !location) {
    throw new ApiError(400, 'A location is required to go online');
  }

  // KYC gate (AUDIT_REPORT.md Phase 1.3) — only blocks going online, never
  // going offline (a worker whose docs lapse mid-shift can still take
  // themselves offline cleanly). Scoped to the three roles that actually
  // hit this endpoint at all (see the role checks below) rather than
  // driver/hamali_solo/mutha_member being spelled out twice.
  if (
    status === 'online' &&
    (req.user!.role === 'driver' || req.user!.role === 'hamali_solo' || req.user!.role === 'mutha_member')
  ) {
    const requester = await User.findById(req.user!.id).select('role kycDocs');
    if (!requester) throw new ApiError(404, 'User not found');
    const outstanding = outstandingKycDocs(requester);
    if (outstanding.length > 0) {
      throw new ApiError(403, kycGateMessage(outstanding, req.user!.locale));
    }
  }

  // Bounds-check whenever a location is present, not only when going
  // online — express-validator's route-level check is conditional on
  // status:'online' (kept, since that's the only case where a MISSING
  // location matters), so a client sending status:'offline' with an
  // out-of-range location was previously writing bad coordinates straight
  // to the DB unvalidated. This is the controller-level backstop.
  if (location) {
    const { lat, lng } = location;
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < LAT_MIN ||
      lat > LAT_MAX ||
      lng < LNG_MIN ||
      lng > LNG_MAX
    ) {
      throw new ApiError(400, 'Invalid location: lat must be -90..90 and lng must be -180..180');
    }
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

  // hamali_solo and mutha_member both have their own HamaliProfile
  // (type:'solo' / type:'mutha_member' respectively) that
  // matching.service's findCandidateHamaliSolos/findCandidateMuthas
  // actually query on — this is the endpoint that makes them
  // discoverable at all. mutha_leader is deliberately NOT included here:
  // leaders have no HamaliProfile (they're group admins, not laborers)
  // and no other per-leader location concept exists — group matchability
  // is entirely member-driven (findCandidateMuthas counts online nearby
  // MEMBERS, never the leader). An earlier version of this endpoint
  // allowed mutha_leader and silently no-op'd (200 success, nothing
  // persisted) when no profile existed, which is always the case for a
  // leader — misleading. Removing the role entirely from this endpoint
  // (see availability.routes.ts) is the honest fix: there's nothing for a
  // leader to toggle here, so let RBAC reject it clearly instead of an API
  // response that claims success for an action with no effect.
  if (req.user!.role === 'hamali_solo' || req.user!.role === 'mutha_member') {
    const profile = await HamaliProfile.findOneAndUpdate({ userId: req.user!.id }, update, { new: true });
    if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
    res.status(200).json({ availabilityStatus: profile.availabilityStatus });
    return;
  }

  throw new ApiError(403, 'This role does not have an availability toggle');
});

// ---- PATCH /api/availability/willing-location ----
// Separate from setAvailability's `location` (live GPS, refreshed each
// time they go online) — this is a self-set anchor point a driver/hamali
// declares once and matching.service searches from with a much wider
// radius (see DRIVER_WILLING_RADIUS_KM/HAMALI_WILLING_RADIUS_KM), so they
// can be found for jobs anchored to a home base even before their live
// GPS ping puts them anywhere near it. null clears it back to live-GPS-only matching.
export const setWillingLocation = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng } = req.body as { lat: number | null; lng: number | null };

  let willingLocation: { type: 'Point'; coordinates: [number, number] } | null = null;
  if (lat !== null && lng !== null) {
    if (
      typeof lat !== 'number' ||
      typeof lng !== 'number' ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < LAT_MIN ||
      lat > LAT_MAX ||
      lng < LNG_MIN ||
      lng > LNG_MAX
    ) {
      throw new ApiError(400, 'Invalid location: lat must be -90..90 and lng must be -180..180');
    }
    willingLocation = { type: 'Point', coordinates: [lng, lat] };
  }

  if (req.user!.role === 'driver') {
    const vehicle = await Vehicle.findOneAndUpdate(
      { ownerId: req.user!.id },
      { $set: { willingLocation } },
      { new: true }
    );
    if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
    res.status(200).json({ willingLocation: presentGeoPoint(vehicle.willingLocation) });
    return;
  }

  if (req.user!.role === 'hamali_solo' || req.user!.role === 'mutha_member') {
    const profile = await HamaliProfile.findOneAndUpdate(
      { userId: req.user!.id },
      { $set: { willingLocation } },
      { new: true }
    );
    if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
    res.status(200).json({ willingLocation: presentGeoPoint(profile.willingLocation) });
    return;
  }

  throw new ApiError(403, 'This role has no willing-location concept');
});
