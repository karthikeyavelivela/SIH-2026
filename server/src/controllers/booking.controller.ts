import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { FareRule, IFareRule } from '../models/FareRule';
import { haversineKm } from '../services/distance.service';
import { bucketVehicleCategoryFromCapacity, computeFareBreakdown } from '../services/fare.service';

async function findActiveRule(region: string, category: string) {
  // Task 4's partial unique index on {region,category,active:true} means at
  // most one document can ever match this filter — the .sort() below is
  // defensive only, not load-bearing for correctness.
  return FareRule.findOne({ region, category, active: true }).sort({ effectiveFrom: -1 });
}

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  // Only these fields are ever read from the body — fareBreakdown, status,
  // customerId, or anything else the client sends is silently ignored.
  const { type, region, cargoDetails, pickupLocation, dropLocation, requiredVehicles, requiredHamaliCount } =
    req.body;

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

  const fareBreakdown = computeFareBreakdown({
    vehicleRule: vehicleRule
      ? {
          baseFare: vehicleRule.baseFare,
          perKmRate: vehicleRule.perKmRate,
          minimumFare: vehicleRule.minimumFare,
          surgeMultiplier: vehicleRule.surgeMultiplier,
        }
      : undefined,
    distanceKm,
    hamaliRule: hamaliRule
      ? {
          baseFare: hamaliRule.baseFare,
          perKmRate: hamaliRule.perKmRate,
          minimumFare: hamaliRule.minimumFare,
          surgeMultiplier: hamaliRule.surgeMultiplier,
        }
      : undefined,
    hamaliCount: requiredHamaliCount ?? 0,
  });

  const booking = await Booking.create({
    customerId: req.user!.id, // never trust a client-supplied customerId
    type,
    cargoDetails,
    pickupLocation: { type: 'Point', coordinates: pickupLocation.coordinates, address: pickupLocation.address },
    dropLocation: { type: 'Point', coordinates: dropLocation.coordinates, address: dropLocation.address },
    requiredVehicles: requiredVehicles ?? [],
    requiredHamaliCount: requiredHamaliCount ?? 0,
    status: 'searching',
    fareBreakdown,
    distanceKm,
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
  });

  res.status(201).json({ booking });
});

export const listMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await Booking.find({ customerId: req.user!.id }).sort({ createdAt: -1 });
  res.status(200).json({ bookings });
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

  res.status(200).json({ booking });
});
