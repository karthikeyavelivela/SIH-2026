import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { EmergencyAlert } from '../models/EmergencyAlert';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { createNotification } from '../services/notification.service';
import { writeAuditLog } from '../services/audit.service';

/**
 * The SOS endpoints.
 *
 * Raising one is deliberately the most permissive write in this codebase:
 * any authenticated role, no booking required, no location required, no
 * rate-limit tier of its own beyond the app-wide one. Everything else here
 * is designed around the same idea — that the cost of a false alarm is far
 * lower than the cost of an alert that did not send.
 *
 * Acting on one is the opposite: only admin and manager can acknowledge or
 * resolve, and both are audit-logged with who did it.
 */

export const raiseAlert = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { kind, note, lat, lng, bookingId } = req.body as {
    kind?: string;
    note?: string;
    lat?: number;
    lng?: number;
    bookingId?: string;
  };

  // An open alert is not duplicated by a second press. People press twice.
  const existing = await EmergencyAlert.findOne({ raisedByUserId: userId, status: { $in: ['open', 'acknowledged'] } });
  if (existing) {
    res.status(200).json({ alert: existing, alreadyOpen: true });
    return;
  }

  // A booking id is only accepted if it is actually the caller's — the same
  // discipline as everywhere else, applied even here.
  let linkedBookingId: string | undefined;
  if (bookingId) {
    const booking = await Booking.findOne({
      _id: bookingId,
      $or: [{ customerId: userId }, { assignedDriverIds: userId }, { assignedHamaliIds: userId }],
    }).select('_id');
    linkedBookingId = booking?._id.toString();
  }

  const alert = await EmergencyAlert.create({
    raisedByUserId: userId,
    raisedByRole: role,
    kind: kind ?? 'other',
    note,
    bookingId: linkedBookingId,
    ...(typeof lat === 'number' && typeof lng === 'number'
      ? { location: { type: 'Point' as const, coordinates: [lng, lat] as [number, number] } }
      : {}),
  });

  // Tell the desk. Best-effort by design — createNotification never throws,
  // because a notification failing must not fail the SOS.
  const [raiser, responders] = await Promise.all([
    User.findById(userId).select('name').lean(),
    User.find({ role: { $in: ['admin', 'manager'] } }).select('_id').lean(),
  ]);
  await Promise.all(
    responders.map((r) =>
      createNotification(r._id.toString(), 'emergency_alert', { name: raiser?.name ?? 'A worker', kind: alert.kind }, '/admin/emergencies')
    )
  );

  await writeAuditLog({
    actorId: userId,
    actorRole: role,
    action: 'emergency_alert_raised',
    targetType: 'EmergencyAlert',
    targetId: alert._id.toString(),
    details: { kind: alert.kind, hasLocation: !!alert.location, bookingId: linkedBookingId },
  });

  res.status(201).json({ alert });
});

/** The caller's own alerts — so a person can see that their SOS went through. */
export const myAlerts = asyncHandler(async (req: Request, res: Response) => {
  const alerts = await EmergencyAlert.find({ raisedByUserId: req.user!.id }).sort({ createdAt: -1 }).limit(20).lean();
  res.status(200).json({ alerts });
});

/** The operations queue. Oldest open first — see the model's index comment. */
export const listAlerts = asyncHandler(async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const alerts = await EmergencyAlert.find(status ? { status } : { status: { $in: ['open', 'acknowledged'] } })
    .sort({ status: 1, createdAt: 1 })
    .limit(100)
    .populate('raisedByUserId', 'name phone role')
    .lean();
  res.status(200).json({ alerts });
});

export const acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
  const alert = await EmergencyAlert.findById(req.params.id);
  if (!alert) throw new ApiError(404, 'Alert not found');
  if (alert.status !== 'open') throw new ApiError(409, 'This alert has already been picked up');

  alert.status = 'acknowledged';
  alert.acknowledgedByUserId = req.user!.id as unknown as typeof alert.acknowledgedByUserId;
  alert.acknowledgedAt = new Date();
  await alert.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'emergency_alert_acknowledged',
    targetType: 'EmergencyAlert',
    targetId: alert._id.toString(),
    details: {},
  });

  res.status(200).json({ alert });
});

export const resolveAlert = asyncHandler(async (req: Request, res: Response) => {
  const { resolutionNote } = req.body as { resolutionNote?: string };
  const alert = await EmergencyAlert.findById(req.params.id);
  if (!alert) throw new ApiError(404, 'Alert not found');
  if (alert.status === 'resolved') throw new ApiError(409, 'This alert is already resolved');

  alert.status = 'resolved';
  alert.resolvedByUserId = req.user!.id as unknown as typeof alert.resolvedByUserId;
  alert.resolvedAt = new Date();
  alert.resolutionNote = resolutionNote;
  await alert.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'emergency_alert_resolved',
    targetType: 'EmergencyAlert',
    targetId: alert._id.toString(),
    details: { resolutionNote },
  });

  res.status(200).json({ alert });
});
