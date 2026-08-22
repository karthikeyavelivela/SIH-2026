import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { rethrowAsConflict } from '../utils/mongoErrors';
import { WarehouseHub } from '../models/WarehouseHub';
import { DockSlot, DockSlotStatus } from '../models/DockSlot';
import { GateEvent } from '../models/GateEvent';
import { writeAuditLog } from '../services/audit.service';

// ---- GET /api/warehouse-hub/me ----
// The caller's own hub only — IDOR check is the query itself
// (ownerId: req.user.id), never a client-supplied hub id.
export const getMyHub = asyncHandler(async (req: Request, res: Response) => {
  const hub = await WarehouseHub.findOne({ ownerId: req.user!.id });
  if (!hub) throw new ApiError(404, 'No warehouse hub found for this account');

  const [dockSlots, gateEvents] = await Promise.all([
    DockSlot.find({ hubId: hub._id }).sort({ label: 1 }),
    GateEvent.find({ hubId: hub._id }).sort({ createdAt: -1 }).limit(20),
  ]);

  res.status(200).json({ hub, dockSlots, gateEvents });
});

// Status transitions that clearly represent something physically entering
// or leaving the dock get an accompanying GateEvent on the live feed;
// transitions into/out of 'reserved' or 'closed' are administrative only
// and don't imply gate activity.
function gateEventTypeForTransition(from: DockSlotStatus, to: DockSlotStatus): 'vehicle_entered' | 'vehicle_exited' | null {
  if (from !== 'occupied' && to === 'occupied') return 'vehicle_entered';
  if (from === 'occupied' && to !== 'occupied') return 'vehicle_exited';
  return null;
}

// ---- PATCH /api/warehouse-hub/me ---- (Phase 2 — facility profile, previously nothing was editable after signup)
export const updateMyHub = asyncHandler(async (req: Request, res: Response) => {
  const { name, address, operatingHours, gateContacts } = req.body as {
    name?: string;
    address?: string;
    operatingHours?: string;
    gateContacts?: { name: string; phone: string }[];
  };

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (address !== undefined) update.address = address;
  if (operatingHours !== undefined) update.operatingHours = operatingHours;
  if (gateContacts !== undefined) update.gateContacts = gateContacts;

  const hub = await WarehouseHub.findOneAndUpdate({ ownerId: req.user!.id }, update, { new: true });
  if (!hub) throw new ApiError(404, 'No warehouse hub found for this account');
  res.status(200).json({ hub });
});

// ---- PATCH /api/warehouse-hub/dock-slots/:id ----
export const updateDockSlotStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body as { status: DockSlotStatus };

  const hub = await WarehouseHub.findOne({ ownerId: req.user!.id });
  if (!hub) throw new ApiError(404, 'No warehouse hub found for this account');

  // Never trust :id alone — it must belong to THIS hub.
  const dockSlot = await DockSlot.findOne({ _id: req.params.id, hubId: hub._id });
  if (!dockSlot) throw new ApiError(404, 'Dock slot not found in your hub');

  const previousStatus = dockSlot.status;
  dockSlot.status = status;
  if (status !== 'occupied' && status !== 'reserved') {
    dockSlot.currentBookingId = undefined;
    dockSlot.etaAt = undefined;
  }
  await dockSlot.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'dock_slot_status_updated',
    targetType: 'DockSlot',
    targetId: dockSlot._id.toString(),
    details: { hubId: hub._id.toString(), from: previousStatus, to: status },
  });

  const gateEventType = gateEventTypeForTransition(previousStatus, status);
  if (gateEventType) {
    await GateEvent.create({
      hubId: hub._id,
      type: gateEventType,
      bookingId: dockSlot.currentBookingId,
    });
  }

  res.status(200).json({ dockSlot });
});

// ---- POST /api/warehouse-hub/dock-slots ----
export const createDockSlot = asyncHandler(async (req: Request, res: Response) => {
  const { label } = req.body as { label: string };

  const hub = await WarehouseHub.findOne({ ownerId: req.user!.id });
  if (!hub) throw new ApiError(404, 'No warehouse hub found for this account');

  let dockSlot;
  try {
    dockSlot = await DockSlot.create({ hubId: hub._id, label, status: 'available' });
  } catch (err) {
    rethrowAsConflict(err, `Dock slot label "${label}"`);
  }

  const updatedHub = await WarehouseHub.findOneAndUpdate(
    { _id: hub._id, ownerId: req.user!.id },
    { $inc: { totalDockSlots: 1 } },
    { new: true }
  );

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'dock_slot_created',
    targetType: 'DockSlot',
    targetId: dockSlot._id.toString(),
    details: { hubId: hub._id.toString(), label },
  });

  res.status(201).json({ dockSlot, hub: updatedHub });
});
