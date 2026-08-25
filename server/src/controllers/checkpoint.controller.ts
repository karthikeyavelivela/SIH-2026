import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Checkpoint } from '../models/Checkpoint';
import { HaltEvent } from '../models/HaltEvent';
import { Booking } from '../models/Booking';
import { haversineKm } from '../services/distance.service';
import { detectUnplannedHaltDeviation } from '../services/fraudDetection.service';
import { createNotification } from '../services/notification.service';
import { writeAuditLog } from '../services/audit.service';

// SIH26089 Phase D.1 — Secure Transit Checkpoints. See Checkpoint.ts /
// HaltEvent.ts for the data-model rationale. This controller is the real
// driver check-in/check-out flow plus the customer-facing chain-of-custody
// read path and a simple, honest route-planning suggestion endpoint.

/** GET /api/checkpoints/nearby?lat&lng&radiusKm — any authenticated role, for map display. */
export const listNearbyCheckpoints = asyncHandler(async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radiusKm = req.query.radiusKm ? Number(req.query.radiusKm) : 25;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new ApiError(400, 'lat/lng required');

  const checkpoints = await Checkpoint.find({
    location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: radiusKm * 1000 } },
  }).limit(30);
  res.status(200).json({ checkpoints });
});

// Real, if simple, "is this roughly on the way" metric: how much extra
// distance visiting this checkpoint adds versus going pickup->drop direct.
// A checkpoint sitting exactly on the straight line scores 0; one far off
// the route scores high and sorts to the bottom. Not a routing-engine
// integration (none is configured anywhere in this codebase) — an honest
// straight-line approximation, same discipline as haversineKm's own doc
// comment ("no routing-engine integration is in scope").
function detourCostKm(pickup: { lat: number; lng: number }, drop: { lat: number; lng: number }, point: { lat: number; lng: number }): number {
  const direct = haversineKm(pickup, drop);
  const via = haversineKm(pickup, point) + haversineKm(point, drop);
  return via - direct;
}

/** GET /api/checkpoints/route-suggestions?pickupLat&pickupLng&dropLat&dropLng — recommended halt points for this specific route. */
export const getRouteHaltSuggestions = asyncHandler(async (req: Request, res: Response) => {
  const pickup = { lat: Number(req.query.pickupLat), lng: Number(req.query.pickupLng) };
  const drop = { lat: Number(req.query.dropLat), lng: Number(req.query.dropLng) };
  if (![pickup.lat, pickup.lng, drop.lat, drop.lng].every(Number.isFinite)) {
    throw new ApiError(400, 'pickupLat/pickupLng/dropLat/dropLng required');
  }

  const directKm = haversineKm(pickup, drop);
  // Only worth suggesting halts on a haul long enough to plausibly need one.
  if (directKm < 15) {
    res.status(200).json({ suggestions: [], directKm: Number(directKm.toFixed(1)) });
    return;
  }

  // Bounding box around the route, generous enough to catch corridor
  // checkpoints without scanning the whole collection.
  const latPad = Math.abs(pickup.lat - drop.lat) / 2 + 0.6;
  const lngPad = Math.abs(pickup.lng - drop.lng) / 2 + 0.6;
  const minLat = Math.min(pickup.lat, drop.lat) - latPad;
  const maxLat = Math.max(pickup.lat, drop.lat) + latPad;
  const minLng = Math.min(pickup.lng, drop.lng) - lngPad;
  const maxLng = Math.max(pickup.lng, drop.lng) + lngPad;

  // `location` carries a 2dsphere index (GeoJSON), and 2dsphere's
  // $geoWithin only accepts a $geometry — the legacy $box shorthand is
  // 2d-index-only and would silently fail to match anything here.
  const boundingPolygon = {
    type: 'Polygon' as const,
    coordinates: [
      [
        [minLng, minLat],
        [maxLng, minLat],
        [maxLng, maxLat],
        [minLng, maxLat],
        [minLng, minLat],
      ],
    ],
  };
  const candidates = await Checkpoint.find({
    location: { $geoWithin: { $geometry: boundingPolygon } },
  }).lean();

  const MAX_DETOUR_KM = Math.max(20, directKm * 0.25);
  const suggestions = candidates
    .map((c) => {
      const [lng, lat] = c.location.coordinates;
      return { checkpoint: c, detourKm: detourCostKm(pickup, drop, { lat, lng }) };
    })
    .filter((s) => s.detourKm <= MAX_DETOUR_KM)
    .sort((a, b) => {
      // CCTV-covered points first (the whole point of this feature), then
      // by how little detour they cost.
      const cctvA = a.checkpoint.cctvAvailable ? 0 : 1;
      const cctvB = b.checkpoint.cctvAvailable ? 0 : 1;
      if (cctvA !== cctvB) return cctvA - cctvB;
      return a.detourKm - b.detourKm;
    })
    .slice(0, 5)
    .map((s) => ({ ...s.checkpoint, detourKm: Number(s.detourKm.toFixed(1)) }));

  res.status(200).json({ suggestions, directKm: Number(directKm.toFixed(1)) });
});

async function assertDriverOnBooking(bookingId: string, driverId: string) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (!booking.assignedDriverIds.some((id) => id.toString() === driverId)) {
    throw new ApiError(403, 'Not assigned to this booking');
  }
  if (booking.status !== 'in_progress') throw new ApiError(400, 'Booking is not in transit');
  return booking;
}

/** POST /api/checkpoints/halts/check-in — driver arrives at a stop (planned or not). */
export const checkInHalt = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, lat, lng } = req.body as { bookingId: string; lat: number; lng: number };
  await assertDriverOnBooking(bookingId, req.user!.id);

  // A designated checkpoint within 1.5km counts as "stopped there" even if
  // GPS isn't exactly on the point — same tolerance discipline as
  // matching.service.ts's search-radius rounding.
  const NEAR_CHECKPOINT_KM = 1.5;
  const nearby = await Checkpoint.findOne({
    location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: NEAR_CHECKPOINT_KM * 1000 } },
  });

  const halt = await HaltEvent.create({
    bookingId,
    driverId: req.user!.id,
    checkpointId: nearby?._id,
    arrivalTime: new Date(),
    driverGeoAtHalt: { type: 'Point', coordinates: [lng, lat] },
  });

  res.status(201).json({ halt, matchedCheckpoint: nearby ?? null });
});

/** PATCH /api/checkpoints/halts/:id/check-out — driver resumes; duration is evaluated here, once it's actually known. */
export const checkOutHalt = asyncHandler(async (req: Request, res: Response) => {
  const halt = await HaltEvent.findById(req.params.id);
  if (!halt) throw new ApiError(404, 'Halt not found');
  if (halt.driverId.toString() !== req.user!.id) throw new ApiError(403, 'Not your halt');
  if (halt.departureTime) throw new ApiError(400, 'Already checked out');

  const { photoProofUrl, odometerReading, sealIntact } = req.body as {
    photoProofUrl?: string;
    odometerReading?: number;
    sealIntact?: boolean;
  };

  halt.departureTime = new Date();
  if (photoProofUrl !== undefined) halt.photoProofUrl = photoProofUrl;
  if (odometerReading !== undefined) halt.odometerReading = odometerReading;
  if (sealIntact !== undefined) halt.sealIntact = sealIntact;
  await halt.save();

  const durationMinutes = (halt.departureTime.getTime() - halt.arrivalTime.getTime()) / 60000;

  if (!halt.checkpointId) {
    const [lng, lat] = halt.driverGeoAtHalt.coordinates;
    await detectUnplannedHaltDeviation(halt.driverId, halt.bookingId, halt._id, durationMinutes, { lat, lng });

    if (durationMinutes >= 20) {
      const booking = await Booking.findById(halt.bookingId).select('customerId').lean();
      if (booking) {
        await createNotification(booking.customerId.toString(), 'unplanned_halt', { minutes: Math.round(durationMinutes) }, `/customer/track/${halt.bookingId}`);
      }
      await writeAuditLog({
        actorId: halt.driverId.toString(),
        actorRole: 'driver',
        action: 'unplanned_halt_flagged',
        targetType: 'HaltEvent',
        targetId: halt._id.toString(),
        details: { bookingId: halt.bookingId.toString(), durationMinutes: Math.round(durationMinutes) },
      });
    }
  }

  res.status(200).json({ halt });
});

/** GET /api/checkpoints/booking/:bookingId/halts — chain-of-custody timeline. Owning customer or an assigned driver only. */
export const listHaltsForBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findById(req.params.bookingId).select('customerId assignedDriverIds').lean();
  if (!booking) throw new ApiError(404, 'Booking not found');

  const isOwner = booking.customerId.toString() === req.user!.id;
  const isAssignedDriver = booking.assignedDriverIds.some((id) => id.toString() === req.user!.id);
  if (!isOwner && !isAssignedDriver && req.user!.role !== 'admin') throw new ApiError(403, 'Forbidden');

  const halts = await HaltEvent.find({ bookingId: req.params.bookingId }).populate('checkpointId').sort({ arrivalTime: 1 });
  res.status(200).json({ halts });
});

// --- Admin checkpoint management ---

/** POST /api/admin/checkpoints — admin adds a real, named checkpoint. */
export const createCheckpoint = asyncHandler(async (req: Request, res: Response) => {
  const { name, lat, lng, type, cctvAvailable, securityRating, operatingHours, amenities, corridor } = req.body;
  const checkpoint = await Checkpoint.create({
    name,
    location: { type: 'Point', coordinates: [lng, lat] },
    type,
    cctvAvailable: !!cctvAvailable,
    securityRating,
    operatingHours,
    verifiedBy: `Admin (${req.user!.id})`,
    amenities: amenities ?? [],
    corridor,
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'checkpoint_created',
    targetType: 'Checkpoint',
    targetId: checkpoint._id.toString(),
    details: { name, type, corridor },
  });

  res.status(201).json({ checkpoint });
});

/** GET /api/admin/checkpoints — every checkpoint, for admin management. */
export const listAllCheckpoints = asyncHandler(async (_req: Request, res: Response) => {
  const checkpoints = await Checkpoint.find().sort({ corridor: 1, name: 1 });
  res.status(200).json({ checkpoints });
});
