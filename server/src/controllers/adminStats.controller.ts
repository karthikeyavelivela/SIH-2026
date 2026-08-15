import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';

/**
 * GET /api/admin/stats — the real KPI numbers behind /admin/dashboard
 * (spec Phase 5: "Admin /dashboard KPIs: active bookings, GMV, open
 * complaints"). GMV here is completed-booking fareBreakdown.total summed
 * — the same server-computed totals every other money-related view in
 * this app reads, never re-derived or estimated.
 */
export const getAdminStats = asyncHandler(async (_req: Request, res: Response) => {
  const activeStatuses = ['requested', 'searching', 'matched', 'accepted', 'in_progress'];

  const [activeBookings, gmvAgg, openComplaints, totalCompletedBookings] = await Promise.all([
    Booking.countDocuments({ status: { $in: activeStatuses } }),
    Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, gmv: { $sum: '$fareBreakdown.total' } } },
    ]),
    Complaint.countDocuments({ status: { $in: ['open', 'in_review'] } }),
    Booking.countDocuments({ status: 'completed' }),
  ]);

  res.status(200).json({
    activeBookings,
    gmv: Math.round(((gmvAgg[0]?.gmv as number) ?? 0) * 100) / 100,
    openComplaints,
    totalCompletedBookings,
  });
});
