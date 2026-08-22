import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { Fleet } from '../models/Fleet';
import { Vehicle } from '../models/Vehicle';
import { User } from '../models/User';
import { MaintenanceSchedule } from '../models/MaintenanceSchedule';
import { VehicleInspection } from '../models/VehicleInspection';
import { uploadImage } from '../services/cloudinary.service';
import { writeAuditLog } from '../services/audit.service';

const MAX_INSPECTION_PHOTO_BYTES = 5 * 1024 * 1024;

// Shared ownership guard for every vehicle-scoped maintenance/inspection
// endpoint below — resolves the caller's Fleet and verifies vehicleId is
// really one of their own units before any read/write touches it. Throws
// (never returns a falsy fleet) so callers can destructure straight away.
async function requireOwnedVehicle(ownerId: string, vehicleId: string) {
  const fleet = await Fleet.findOne({ ownerId });
  if (!fleet) throw new ApiError(404, 'No fleet found for this account');
  const owns = fleet.vehicleIds.some((id) => id.toString() === vehicleId);
  if (!owns) throw new ApiError(404, 'Vehicle not found in your fleet');
  const vehicle = await Vehicle.findById(vehicleId);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  return { fleet, vehicle };
}

function decodeBase64Image(dataUrl: string, label: string): Buffer {
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/.exec(dataUrl ?? '');
  if (!match) throw new ApiError(400, `${label} must be a data:image/(png|jpeg|webp);base64,... URL`);
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.byteLength > MAX_INSPECTION_PHOTO_BYTES) throw new ApiError(400, `${label} is too large (max 5MB)`);
  return buffer;
}

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

/**
 * PATCH /api/fleet/me — Phase 2, company profile name edit. GSTIN is
 * deliberately NOT a field here: it's already a required KYC document type
 * for fleet_owner (REQUIRED_KYC_DOCS_BY_ROLE), uploaded and admin-verified
 * through kycDocument.controller.ts, not free text a fleet owner can edit
 * themselves after the fact. "Billing" from the Phase 2 spec is
 * deliberately not built: no platform-charges-fleet-owner model exists
 * anywhere in this codebase (no subscription/invoice model, nothing to
 * bill) — a billing screen would have nothing real behind it.
 */
export const updateMyFleet = asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body as { name?: string };
  const fleet = await Fleet.findOneAndUpdate({ ownerId: req.user!.id }, { name }, { new: true });
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

const DAYS_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_WINDOW_DAYS = 7;

// Recomputes a date-triggered schedule's live status against "now" —
// upcoming/due/overdue is a function of dueAt, not something a client (or a
// stale write) should ever set directly. Mileage-triggered entries have no
// live odometer feed to compare against yet, so their stored status is left
// alone here.
function liveMaintenanceStatus(
  s: { type: 'mileage_triggered' | 'date_triggered'; dueAt?: Date; status: 'upcoming' | 'due' | 'overdue' | 'completed' }
): 'upcoming' | 'due' | 'overdue' | 'completed' {
  if (s.status === 'completed' || s.type !== 'date_triggered' || !s.dueAt) return s.status;
  const now = Date.now();
  const due = s.dueAt.getTime();
  if (due < now) return 'overdue';
  if (due - now <= DUE_SOON_WINDOW_DAYS * DAYS_MS) return 'due';
  return 'upcoming';
}

// ---- GET /api/fleet/health ----
// Fleet-wide health % — the share of the caller's vehicles that are both
// compliant (no failed inspection outstanding) and have no overdue
// maintenance. Also surfaces the single soonest upcoming/due item as
// "next service", matching the fleet_maintenance_scheduler mock.
export const getFleetHealth = asyncHandler(async (req: Request, res: Response) => {
  const fleet = await Fleet.findOne({ ownerId: req.user!.id });
  if (!fleet) throw new ApiError(404, 'No fleet found for this account');

  const vehicles = await Vehicle.find({ _id: { $in: fleet.vehicleIds } })
    .select('registrationNumber complianceStatus')
    .lean();

  const schedules = await MaintenanceSchedule.find({ fleetId: fleet._id, status: { $ne: 'completed' } })
    .populate({ path: 'vehicleId', select: 'registrationNumber' })
    .lean();

  const overdueVehicleIds = new Set(
    schedules.filter((s) => liveMaintenanceStatus(s as never) === 'overdue').map((s) => s.vehicleId.toString())
  );

  const totalVehicles = vehicles.length;
  const attentionNeeded = vehicles.filter(
    (v) => v.complianceStatus === 'non_compliant' || overdueVehicleIds.has(v._id.toString())
  ).length;
  const healthPct = totalVehicles === 0 ? 100 : Math.round(((totalVehicles - attentionNeeded) / totalVehicles) * 100);

  const upcoming = schedules
    .map((s) => ({ ...s, liveStatus: liveMaintenanceStatus(s as never) }))
    .filter((s) => s.liveStatus !== 'completed' && s.type === 'date_triggered' && s.dueAt)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());

  res.status(200).json({
    healthPct,
    totalVehicles,
    vehiclesNeedingAttention: attentionNeeded,
    nextService: upcoming[0] ?? null,
  });
});

// ---- GET /api/fleet/maintenance ----
// All schedules across the fleet (optionally filtered by ?vehicleId=),
// newest-due first, with live-computed status.
export const listMaintenanceSchedules = asyncHandler(async (req: Request, res: Response) => {
  const fleet = await Fleet.findOne({ ownerId: req.user!.id });
  if (!fleet) throw new ApiError(404, 'No fleet found for this account');

  const query: Record<string, unknown> = { fleetId: fleet._id };
  if (req.query.vehicleId) query.vehicleId = req.query.vehicleId;

  const schedules = await MaintenanceSchedule.find(query)
    .populate({ path: 'vehicleId', select: 'registrationNumber type' })
    .sort({ dueAt: 1, createdAt: -1 })
    .lean();

  const withLiveStatus = schedules.map((s) => ({ ...s, status: liveMaintenanceStatus(s as never) }));
  res.status(200).json({ schedules: withLiveStatus });
});

// ---- POST /api/fleet/vehicles/:vehicleId/maintenance ----
export const createMaintenanceSchedule = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  const { fleet, vehicle } = await requireOwnedVehicle(req.user!.id, vehicleId);

  const { type, dueAt, dueMileageKm, description } = req.body as {
    type: 'mileage_triggered' | 'date_triggered';
    dueAt?: string;
    dueMileageKm?: number;
    description: string;
  };

  if (type === 'date_triggered' && !dueAt) throw new ApiError(400, 'dueAt is required for a date-triggered schedule');
  if (type === 'mileage_triggered' && dueMileageKm === undefined) {
    throw new ApiError(400, 'dueMileageKm is required for a mileage-triggered schedule');
  }

  const schedule = await MaintenanceSchedule.create({
    vehicleId: vehicle._id,
    fleetId: fleet._id,
    type,
    dueAt: type === 'date_triggered' ? new Date(dueAt!) : undefined,
    dueMileageKm: type === 'mileage_triggered' ? dueMileageKm : undefined,
    description,
    status: 'upcoming',
  });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'maintenance_schedule_created',
    targetType: 'MaintenanceSchedule',
    targetId: schedule._id.toString(),
    details: { vehicleId, type, description },
  });

  res.status(201).json({ schedule });
});

// ---- PATCH /api/fleet/maintenance/:scheduleId ----
// The "Book Repair" action from the mock is just this endpoint called with
// { status: 'completed' } (or 'due'/'overdue' to acknowledge without
// closing it out yet) — no separate booking/vendor system exists to model.
export const updateMaintenanceSchedule = asyncHandler(async (req: Request, res: Response) => {
  const { scheduleId } = req.params;
  const { status } = req.body as { status: 'upcoming' | 'due' | 'overdue' | 'completed' };

  const fleet = await Fleet.findOne({ ownerId: req.user!.id });
  if (!fleet) throw new ApiError(404, 'No fleet found for this account');

  const schedule = await MaintenanceSchedule.findOneAndUpdate(
    { _id: scheduleId, fleetId: fleet._id },
    { status, completedAt: status === 'completed' ? new Date() : undefined },
    { new: true }
  );
  if (!schedule) throw new ApiError(404, 'Maintenance schedule not found in your fleet');

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'maintenance_schedule_updated',
    targetType: 'MaintenanceSchedule',
    targetId: schedule._id.toString(),
    details: { status },
  });

  res.status(200).json({ schedule });
});

// ---- GET /api/fleet/vehicles/:vehicleId/inspections ----
export const listVehicleInspections = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  await requireOwnedVehicle(req.user!.id, vehicleId);

  const inspections = await VehicleInspection.find({ vehicleId }).sort({ inspectedAt: -1 }).lean();
  res.status(200).json({ inspections });
});

// ---- POST /api/fleet/vehicles/:vehicleId/inspections ----
// body { photos: {front,rear,driverSide,passengerSide} (base64 data URLs),
// checklist: [{item,result,note?}], overallVerdict }. Uploads all 4 photos
// via the same cloudinary base64 pattern auth.controller's updateMyPhoto
// uses. A 'non_compliant' verdict flips Vehicle.complianceStatus — the gate
// documented on Vehicle.complianceStatus's schema comment.
export const submitVehicleInspection = asyncHandler(async (req: Request, res: Response) => {
  const { vehicleId } = req.params;
  const { fleet, vehicle } = await requireOwnedVehicle(req.user!.id, vehicleId);

  const { photos, checklist, overallVerdict } = req.body as {
    photos: { front: string; rear: string; driverSide: string; passengerSide: string };
    checklist: { item: string; result: 'pass' | 'warn' | 'fail'; note?: string }[];
    overallVerdict: 'compliant' | 'non_compliant';
  };

  const folder = `fleet/${fleet._id.toString()}/vehicles/${vehicle._id.toString()}/inspections`;
  const [front, rear, driverSide, passengerSide] = await Promise.all([
    uploadImage(decodeBase64Image(photos.front, 'Front photo'), `${folder}/front`),
    uploadImage(decodeBase64Image(photos.rear, 'Rear photo'), `${folder}/rear`),
    uploadImage(decodeBase64Image(photos.driverSide, 'Driver-side photo'), `${folder}/driver-side`),
    uploadImage(decodeBase64Image(photos.passengerSide, 'Passenger-side photo'), `${folder}/passenger-side`),
  ]);

  const inspection = await VehicleInspection.create({
    vehicleId: vehicle._id,
    fleetId: fleet._id,
    inspectedAt: new Date(),
    photos: { front: front.url, rear: rear.url, driverSide: driverSide.url, passengerSide: passengerSide.url },
    checklist,
    overallVerdict,
    inspectedBy: req.user!.id,
  });

  vehicle.complianceStatus = overallVerdict === 'non_compliant' ? 'non_compliant' : 'compliant';
  await vehicle.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'vehicle_inspection_submitted',
    targetType: 'Vehicle',
    targetId: vehicle._id.toString(),
    details: { inspectionId: inspection._id.toString(), overallVerdict },
  });

  res.status(201).json({ inspection, vehicle });
});
