import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { FareRule, IFareRule } from '../models/FareRule';
import { haversineKm } from '../services/distance.service';
import { bucketVehicleCategoryFromCapacity, computeFareBreakdown } from '../services/fare.service';
import { getSurgeMultiplier } from '../services/surge.service';
import { startVehicleOffers, startHamaliOffers } from '../realtime/offerEngine';
import { findUnratedCompletedBooking } from '../services/ratingGate.service';
import { detectAbnormalCancellationRate } from '../services/fraudDetection.service';

async function findActiveRule(region: string, category: string) {
  // Task 4's partial unique index on {region,category,active:true} means at
  // most one document can ever match this filter — the .sort() below is
  // defensive only, not load-bearing for correctness.
  return FareRule.findOne({ region, category, active: true }).sort({ effectiveFrom: -1 });
}

interface QuoteInput {
  type: 'truck' | 'hamali' | 'combo';
  region: string;
  pickupLocation: { coordinates: [number, number] };
  dropLocation: { coordinates: [number, number] };
  requiredVehicles?: { capacityKg: number; count: number }[];
  requiredHamaliCount?: number;
}

// Shared by both the quote (preview, no write) and create (persists) paths
// so the two can never compute a different fare for the same inputs — the
// client-facing "estimate" the customer confirms against is the exact same
// code path that produces the fareBreakdown actually saved on the Booking.
async function priceBooking(input: QuoteInput) {
  const { type, region, pickupLocation, dropLocation, requiredVehicles, requiredHamaliCount } = input;

  const distanceKm = haversineKm(
    { lat: pickupLocation.coordinates[1], lng: pickupLocation.coordinates[0] },
    { lat: dropLocation.coordinates[1], lng: dropLocation.coordinates[0] }
  );

  let vehicleRule: IFareRule | null = null;
  if (type === 'truck' || type === 'combo') {
    const vehicleSpec = requiredVehicles?.[0];
    if (!vehicleSpec) throw new ApiError(400, 'requiredVehicles is required for truck/combo bookings');
    // Validates capacityKg directly (throws ApiError(400) on null/NaN/<=0)
    // rather than round-tripping through a manufactured vehicleType string
    // — a malformed capacityKg used to silently fall through to a
    // plausible-but-wrong tier instead of being rejected.
    const category = bucketVehicleCategoryFromCapacity(vehicleSpec.capacityKg);
    const rule = await findActiveRule(region, category);
    if (!rule) throw new ApiError(422, `No active fare rule for ${region}/${category}`);
    vehicleRule = rule;
  }

  let hamaliRule: IFareRule | null = null;
  if (type === 'hamali' || type === 'combo') {
    // A hamali/combo booking with no actual workers requested would create
    // a real, matchable, zero-fare booking — reject it the same way a
    // truck/combo booking with no vehicle spec is already rejected above.
    if (!requiredHamaliCount || requiredHamaliCount <= 0) {
      throw new ApiError(400, 'requiredHamaliCount must be greater than 0 for hamali/combo bookings');
    }
    const rule = await findActiveRule(region, 'hamali');
    if (!rule) throw new ApiError(422, `No active fare rule for ${region}/hamali`);
    hamaliRule = rule;
  }

  // Phase 5: the live region surge ratio REPLACES each rule's stored
  // surgeMultiplier at pricing time — that stored field (admin-settable,
  // always 1.0 by default) was Phase 2's placeholder until this existed.
  // computeFareBreakdown's "higher of the two present components' surge
  // wins" logic (see its own doc comment) still applies unchanged; both
  // components now just get the same region-live value, so that rule is
  // harmless here rather than meaningful, until vehicle/hamali surge is
  // ever computed independently.
  const liveSurge = await getSurgeMultiplier(region);

  const fareBreakdown = computeFareBreakdown({
    vehicleRule: vehicleRule
      ? {
          baseFare: vehicleRule.baseFare,
          perKmRate: vehicleRule.perKmRate,
          minimumFare: vehicleRule.minimumFare,
          surgeMultiplier: liveSurge,
        }
      : undefined,
    distanceKm,
    hamaliRule: hamaliRule
      ? {
          baseFare: hamaliRule.baseFare,
          perKmRate: hamaliRule.perKmRate,
          minimumFare: hamaliRule.minimumFare,
          surgeMultiplier: liveSurge,
        }
      : undefined,
    hamaliCount: requiredHamaliCount ?? 0,
  });

  return { fareBreakdown, distanceKm };
}

// Preview-only: prices a would-be booking without writing anything, so the
// client can show an honest itemized total before the customer commits.
// Takes the exact same shape as createBooking's pricing inputs (and the
// exact same route-level validators) so a quote can never diverge from
// what create would actually charge.
export const quoteBooking = asyncHandler(async (req: Request, res: Response) => {
  const { type, region, pickupLocation, dropLocation, requiredVehicles, requiredHamaliCount } = req.body;
  const { fareBreakdown, distanceKm } = await priceBooking({
    type,
    region,
    pickupLocation,
    dropLocation,
    requiredVehicles,
    requiredHamaliCount,
  });
  res.status(200).json({ fareBreakdown, distanceKm });
});

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  // Spec: rating is "mandatory before either can start a new booking/accept
  // a new job, to keep rating coverage high". Checked before any other
  // work so a customer with an unrated completed trip is blocked at the
  // very first step, not partway through pricing/creation.
  const unratedBookingId = await findUnratedCompletedBooking(req.user!.id);
  if (unratedBookingId) {
    throw new ApiError(403, 'Please rate your last completed booking before making a new one', {
      unratedBookingId,
    });
  }

  // Only these fields are ever read from the body — fareBreakdown, status,
  // customerId, or anything else the client sends is silently ignored.
  const {
    type,
    region,
    cargoDetails,
    pickupLocation,
    dropLocation,
    requiredVehicles,
    requiredHamaliCount,
    scheduledFor,
    openForBidding,
  } = req.body;

  // Phase 6.2 — load board with bidding. See Booking.openForBidding's doc
  // comment for the full scoping rationale (truck/hamali only, never
  // combo/scheduled — a single winning bidder maps onto the existing
  // single-actor accept functions, a combo/mutha crew winning bid does not).
  if (openForBidding) {
    if (type === 'combo') throw new ApiError(400, 'Bidding is not available for combo bookings yet');
    if (scheduledFor) throw new ApiError(400, 'Bidding is not available for scheduled bookings');
  }

  // Phase 6 — scheduled booking. scheduledFor is optional; when present it
  // must be far enough out that "scheduled" actually means something
  // (not indistinguishable from instant) and not unreasonably far ahead
  // (surge/fare rules this far out are not something priceBooking commits
  // to honouring literally at release time — see the note on the release
  // loop re-using the exact same matching path, not the exact same price).
  const MIN_LEAD_MS = 30 * 60 * 1000;
  const MAX_LEAD_MS = 14 * 24 * 60 * 60 * 1000;
  let scheduledForDate: Date | undefined;
  if (scheduledFor) {
    scheduledForDate = new Date(scheduledFor);
    const leadMs = scheduledForDate.getTime() - Date.now();
    if (Number.isNaN(scheduledForDate.getTime())) throw new ApiError(400, 'scheduledFor is not a valid date');
    if (leadMs < MIN_LEAD_MS) throw new ApiError(400, 'scheduledFor must be at least 30 minutes from now');
    if (leadMs > MAX_LEAD_MS) throw new ApiError(400, 'scheduledFor cannot be more than 14 days from now');
  }

  const { fareBreakdown, distanceKm } = await priceBooking({
    type,
    region,
    pickupLocation,
    dropLocation,
    requiredVehicles,
    requiredHamaliCount,
  });

  const initialStatus = scheduledForDate ? 'scheduled' : 'searching';
  const booking = await Booking.create({
    customerId: req.user!.id, // never trust a client-supplied customerId
    type,
    region,
    cargoDetails,
    pickupLocation: { type: 'Point', coordinates: pickupLocation.coordinates, address: pickupLocation.address },
    dropLocation: { type: 'Point', coordinates: dropLocation.coordinates, address: dropLocation.address },
    requiredVehicles: requiredVehicles ?? [],
    requiredHamaliCount: requiredHamaliCount ?? 0,
    status: initialStatus,
    fareBreakdown,
    distanceKm,
    statusHistory: [{ status: initialStatus, timestamp: new Date() }],
    scheduledFor: scheduledForDate,
    openForBidding: !!openForBidding,
  });

  // A scheduled booking's matching is deliberately deferred —
  // scheduledBooking.service.ts's release loop starts offers once
  // scheduledFor arrives, not now. An open-for-bidding booking's matching
  // is deliberately skipped entirely — Phase 3's push-offer engine offers
  // at the fixed computed fareBreakdown.total, which doesn't make sense
  // for a booking whose whole point is letting workers propose their own
  // price instead. It's still visible on the ordinary browse list AND on
  // GET /api/loadboard; workers place a Bid instead of hitting accept.
  if (!scheduledForDate && !booking.openForBidding) {
    // Kick off Phase 3's sequential-timed-offer flow immediately — fire and
    // forget from the HTTP handler's perspective (the booking is already
    // created and returned to the customer regardless of matching progress;
    // matching itself is inherently async and observed via socket pushes /
    // the existing poll endpoints, never blocks the create response). Errors
    // here are the same "best-effort push" class as every realtime emitter —
    // logged, not surfaced to the customer as a booking-creation failure.
    if (booking.type === 'truck' || booking.type === 'combo') {
      startVehicleOffers(booking).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('startVehicleOffers failed:', err);
      });
    }
    if (booking.type === 'hamali' || booking.type === 'combo') {
      startHamaliOffers(booking).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('startHamaliOffers failed:', err);
      });
    }
  }

  res.status(201).json({ booking });
});

export const listMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await Booking.find({ customerId: req.user!.id }).sort({ createdAt: -1 });
  res.status(200).json({ bookings });
});

/**
 * GET /api/bookings/frequent-routes — Phase 2 customer profile addition.
 * Real aggregation over the customer's own booking history (pickup/drop
 * address pairs, by frequency), not a separate saved-preference the
 * customer has to maintain — it reflects what they've actually booked
 * before, updating itself as their real usage does.
 */
export const getMyFrequentRoutes = asyncHandler(async (req: Request, res: Response) => {
  // Aggregation pipelines don't auto-cast a string to ObjectId the way
  // .find()/.findOne() do — this needs an explicit cast or $match silently
  // matches nothing.
  const routes = await Booking.aggregate([
    { $match: { customerId: new Types.ObjectId(req.user!.id) } },
    {
      $group: {
        _id: { pickup: '$pickupLocation.address', drop: '$dropLocation.address' },
        count: { $sum: 1 },
        lastUsedAt: { $max: '$createdAt' },
      },
    },
    { $sort: { count: -1, lastUsedAt: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, pickup: '$_id.pickup', drop: '$_id.drop', count: 1, lastUsedAt: 1 } },
  ]);
  res.status(200).json({ routes });
});

export const getMyBooking = asyncHandler(async (req: Request, res: Response) => {
  // Scoped by customerId from the JWT, not just the :id param, so one
  // customer can never fetch another's booking by guessing/enumerating ids.
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.status(200).json({ booking });
});

export const cancelMyBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw new ApiError(400, `Cannot cancel a booking that is already ${booking.status}`);
  }

  booking.status = 'cancelled';
  booking.statusHistory.push({ status: 'cancelled', timestamp: new Date() });
  await booking.save();

  // Fire-and-forget — never blocks a legitimate cancel on a detector issue.
  detectAbnormalCancellationRate(req.user!.id).catch(() => {});

  res.status(200).json({ booking });
});
