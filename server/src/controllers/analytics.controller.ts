import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { Booking } from '../models/Booking';
import { Vehicle } from '../models/Vehicle';

const ACTIVE_STATUSES = ['requested', 'searching', 'matched', 'accepted', 'in_progress'];

/**
 * GET /api/admin/analytics/overview — KPI grid + demand heatmap points +
 * 14-day revenue trend. Every number here is a real aggregation against
 * Booking/Vehicle — nothing fabricated. On a sparse/empty dev DB this
 * returns zeros/empty arrays, which the client renders via EmptyState, not
 * placeholder numbers.
 */
export const getAnalyticsOverview = asyncHandler(async (_req: Request, res: Response) => {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const [
    revenueAgg,
    activeTrips,
    completedCount,
    avgDeliveryAgg,
    vehicleCounts,
    heatmapAgg,
    revenueTrendAgg,
  ] = await Promise.all([
    Booking.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$fareBreakdown.total' } } },
    ]),
    Booking.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
    Booking.countDocuments({ status: 'completed' }),
    // Avg delivery time: minutes between the first statusHistory entry and
    // the 'completed' entry, for bookings that actually have both.
    Booking.aggregate([
      { $match: { status: 'completed', 'statusHistory.0': { $exists: true } } },
      {
        $project: {
          startedAt: { $arrayElemAt: ['$statusHistory.timestamp', 0] },
          completedAt: {
            $let: {
              vars: {
                completedEntry: {
                  $first: {
                    $filter: { input: '$statusHistory', cond: { $eq: ['$$this.status', 'completed'] } },
                  },
                },
              },
              in: '$$completedEntry.timestamp',
            },
          },
        },
      },
      { $match: { completedAt: { $ne: null } } },
      { $project: { minutes: { $divide: [{ $subtract: ['$completedAt', '$startedAt'] }, 60000] } } },
      { $group: { _id: null, avgMinutes: { $avg: '$minutes' } } },
    ]),
    Vehicle.aggregate([{ $group: { _id: '$availabilityStatus', count: { $sum: 1 } } }]),
    // Demand hotspots: bucket pickup coordinates to ~0.02deg (~2km) grid
    // cells and count bookings in each — cheap, dependency-free clustering.
    Booking.aggregate([
      {
        $project: {
          lat: { $round: [{ $multiply: [{ $arrayElemAt: ['$pickupLocation.coordinates', 1] }, 50] }, 0] },
          lng: { $round: [{ $multiply: [{ $arrayElemAt: ['$pickupLocation.coordinates', 0] }, 50] }, 0] },
        },
      },
      { $group: { _id: { lat: '$lat', lng: '$lng' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 50 },
    ]),
    Booking.aggregate([
      { $match: { status: 'completed', createdAt: { $gte: fourteenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$fareBreakdown.total' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const vehicleTotals = { online: 0, offline: 0, on_job: 0 };
  for (const row of vehicleCounts as { _id: keyof typeof vehicleTotals; count: number }[]) {
    if (row._id in vehicleTotals) vehicleTotals[row._id] = row.count;
  }
  const totalVehicles = vehicleTotals.online + vehicleTotals.offline + vehicleTotals.on_job;
  const fleetUtilization = totalVehicles > 0 ? Math.round((vehicleTotals.on_job / totalVehicles) * 100) : 0;

  const maxHeat = Math.max(1, ...(heatmapAgg as { count: number }[]).map((r) => r.count));
  const heatmap = (heatmapAgg as { _id: { lat: number; lng: number }; count: number }[]).map((r) => ({
    lat: r._id.lat / 50,
    lng: r._id.lng / 50,
    intensity: Math.min(1, r.count / maxHeat),
    label: `${r.count} pickup${r.count === 1 ? '' : 's'}`,
  }));

  res.status(200).json({
    kpis: {
      revenue: Math.round(((revenueAgg[0]?.total as number) ?? 0) * 100) / 100,
      activeTrips,
      completedTrips: completedCount,
      fleetUtilization,
      avgDeliveryMinutes: Math.round(((avgDeliveryAgg[0]?.avgMinutes as number) ?? 0) * 10) / 10,
    },
    heatmap,
    revenueTrend: (revenueTrendAgg as { _id: string; total: number }[]).map((r) => ({
      date: r._id,
      total: Math.round(r.total * 100) / 100,
    })),
  });
});
