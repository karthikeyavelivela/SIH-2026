import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { Fleet } from '../models/Fleet';
import { Vehicle } from '../models/Vehicle';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';

// ---- GET /api/fleet/me ----
// The caller's own Fleet doc only — never a client-supplied fleet/owner id.
// IDOR check is the query itself: Fleet.findOne({ ownerId: req.user.id }).
export const getMyFleet = asyncHandler(async (req: Request, res: Response) => {
  const fleet = await Fleet.findOne({ ownerId: req.user!.id })
    .populate({
      path: 'vehicleIds',
      select: 'type capacityKg registrationNumber availabilityStatus verified assignedDriverId',
      populate: { path: 'assignedDriverId', select: 'name phone ratingAvg ratingCount' },
    })
    .populate({ path: 'driverIds', select: 'name phone ratingAvg ratingCount accountStatus' });

  if (!fleet) throw new ApiError(404, 'No fleet found for this account');

  res.status(200).json({ fleet });
});

// ---- POST /api/fleet/vehicles ----
// Registers a new vehicle owned by the fleet owner and adds it to their
// Fleet.vehicleIds roster.
export const registerFleetVehicle = asyncHandler(async (req: Request, res: Response) => {
  const fleet = await Fleet.findOne({ ownerId: req.user!.id });
  if (!fleet) throw new ApiError(404, 'No fleet found for this account');

  const { vehicleType, capacityKg, registrationNumber } = req.body as {
    vehicleType: string;
    capacityKg: number;
    registrationNumber: string;
  };

  let vehicle;
  try {
    vehicle = await Vehicle.create({
      ownerId: req.user!.id,
      type: vehicleType,
      capacityKg,
      registrationNumber,
      verified: false,
    });
  } catch (err) {
    rethrowAsConflict(err, 'Vehicle registration number');
  }

  const updatedFleet = await Fleet.findOneAndUpdate(
    { _id: fleet._id, ownerId: req.user!.id },
    { $addToSet: { vehicleIds: vehicle._id } },
    { new: true }
  );
  if (!updatedFleet) {
    // Fleet vanished between the two calls (shouldn't happen) — don't leave
    // an orphaned vehicle with no roster entry.
    await Vehicle.findByIdAndDelete(vehicle._id);
    throw new ApiError(404, 'No fleet found for this account');
  }

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'fleet_vehicle_registered',
    targetType: 'Vehicle',
    targetId: vehicle._id.toString(),
    details: { fleetId: fleet._id.toString(), registrationNumber: vehicle.registrationNumber },
  });

  res.status(201).json({ vehicle, fleet: updatedFleet });
});

// ---- POST /api/fleet/assign-driver ----
// body { driverId, vehicleId }. Verifies driverId really is a driver-role
// user and vehicleId really belongs to THIS fleet (never trusts the client
// on either), then pairs the driver to that unit on the roster.
export const assignDriverToVehicle = asyncHandler(async (req: Request, res: Response) => {
  const { driverId, vehicleId } = req.body as { driverId: string; vehicleId: string };

  const fleet = await Fleet.findOne({ ownerId: req.user!.id });
  if (!fleet) throw new ApiError(404, 'No fleet found for this account');

  const vehicleBelongsToFleet = fleet.vehicleIds.some((id) => id.toString() === vehicleId);
  if (!vehicleBelongsToFleet) throw new ApiError(404, 'Vehicle not found in your fleet');

  const driver = await User.findById(driverId);
  if (!driver || driver.role !== 'driver') {
    throw new ApiError(400, 'driverId must belong to a driver-role user');
  }

  const vehicle = await Vehicle.findByIdAndUpdate(vehicleId, { assignedDriverId: driver._id }, { new: true });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');

  const updatedFleet = await Fleet.findOneAndUpdate(
    { _id: fleet._id, ownerId: req.user!.id },
    { $addToSet: { driverIds: driver._id } },
    { new: true }
  )
    .populate({
      path: 'vehicleIds',
      select: 'type capacityKg registrationNumber availabilityStatus verified assignedDriverId',
      populate: { path: 'assignedDriverId', select: 'name phone ratingAvg ratingCount' },
    })
    .populate({ path: 'driverIds', select: 'name phone ratingAvg ratingCount accountStatus' });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'fleet_driver_assigned',
    targetType: 'Vehicle',
    targetId: vehicleId,
    details: { driverId, fleetId: fleet._id.toString() },
  });

  res.status(200).json({ fleet: updatedFleet });
});
