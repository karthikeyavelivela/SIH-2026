import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Booking } from '../models/Booking';
import { Complaint } from '../models/Complaint';
import { Dispute } from '../models/Dispute';
import { HamaliProfile } from '../models/HamaliProfile';
import { Vehicle } from '../models/Vehicle';

/**
 * GET /api/admin/stats — the real KPI numbers behind /admin/dashboard
 * (spec Phase 5: "Admin /dashboard KPIs: active bookings, GMV, open
 * complaints"). GMV here is completed-booking fareBreakdown.total summed
 * — the same server-computed totals every other money-related view in
 * this app reads, never re-derived or estimated.
 */
export const getAdminStats = asyncHandler(async (_req: Request, res: Response) => {
  const activeStatuses = ['requested', 'searching', 'matched', 'accepted', 'in_progress'];

  // 'workersOnline' and 'openDisputes' are counted here because the admin
  // overview needs both and neither had a source: the console could show
  // how many jobs were running but not how many people were available to
  // take them, and grievances were complaint-only even though a dispute is
  // the more serious of the two.
  const availableStatuses = ['online', 'on_job'];

  const [activeBookings, gmvAgg, openComplaints, totalCompletedBookings, workersOnline, vehiclesOnline, openDisputes] =
    await Promise.all([
      Booking.countDocuments({ status: { $in: activeStatuses } }),
      Booking.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, gmv: { $sum: '$fareBreakdown.total' } } },
      ]),
      Complaint.countDocuments({ status: { $in: ['open', 'in_review'] } }),
      Booking.countDocuments({ status: 'completed' }),
      HamaliProfile.countDocuments({ availabilityStatus: { $in: availableStatuses } }),
      Vehicle.countDocuments({ availabilityStatus: { $in: availableStatuses } }),
      Dispute.countDocuments({ status: { $in: ['open', 'investigating', 'escalated'] } }),
    ]);

  res.status(200).json({
    activeBookings,
    gmv: Math.round(((gmvAgg[0]?.gmv as number) ?? 0) * 100) / 100,
    openComplaints,
    totalCompletedBookings,
    workersOnline,
    vehiclesOnline,
    openDisputes,
  });
});
