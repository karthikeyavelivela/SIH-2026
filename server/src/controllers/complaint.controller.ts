import { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';
import { Mutha } from '../models/Mutha';
import { writeAuditLog } from '../services/audit.service';

/** Same "was this caller actually a party to the booking" check ratings/realtime rooms already use, re-derived server-side every time — never trust a client claim. */
async function assertPartyToBooking(bookingId: string, userId: string, role: string): Promise<void> {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');

  const isParty =
    booking.customerId.toString() === userId ||
    booking.assignedDriverIds.some((id) => id.toString() === userId) ||
    booking.assignedHamaliIds.some((id) => id.toString() === userId);
  if (isParty) return;

  if (role === 'mutha_leader' && booking.assignedMuthaId) {
    const mutha = await Mutha.findOne({ leaderId: userId }).select('_id').lean();
    if (mutha && mutha._id.toString() === booking.assignedMuthaId.toString()) return;
  }

  throw new ApiError(403, 'You were not a party to this booking');
}

export const raiseComplaint = asyncHandler(async (req: Request, res: Response) => {
  const { bookingId, category, description, againstUserId, againstMuthaId } = req.body;
  await assertPartyToBooking(bookingId, req.user!.id, req.user!.role);

  const complaint = await Complaint.create({
    bookingId,
    raisedByUserId: req.user!.id,
    againstUserId,
    againstMuthaId,
    category,
    description,
    status: 'open',
  });
  res.status(201).json({ complaint });
});

export const myComplaints = asyncHandler(async (req: Request, res: Response) => {
  const complaints = await Complaint.find({ raisedByUserId: req.user!.id }).sort({ createdAt: -1 });
  res.status(200).json({ complaints });
});

// ---- Admin/Manager resolution queue ----

export const listComplaints = asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.query as Record<string, string>;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;
  const complaints = await Complaint.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ complaints });
});

export const resolveComplaint = asyncHandler(async (req: Request, res: Response) => {
  const { status, resolutionNote } = req.body;
  const complaint = await Complaint.findById(req.params.id);
  if (!complaint) throw new ApiError(404, 'Complaint not found');
  if (complaint.status === 'resolved') throw new ApiError(400, 'This complaint is already resolved');

  complaint.status = status;
  complaint.resolutionNote = resolutionNote;
  complaint.handledByUserId = new Types.ObjectId(req.user!.id);
  if (status === 'resolved') complaint.resolvedAt = new Date();
  await complaint.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'complaint_resolved',
    targetType: 'Complaint',
    targetId: complaint._id.toString(),
    details: { status, resolutionNote },
  });

  res.status(200).json({ complaint });
});
