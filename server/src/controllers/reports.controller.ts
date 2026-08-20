import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { LedgerEntry } from '../models/LedgerEntry';
import { Booking } from '../models/Booking';

function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header.join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n');
}

interface ReportQuery {
  source: 'ledger' | 'bookings';
  from?: string;
  to?: string;
  region?: string;
}

function dateFilter(from?: string, to?: string): Record<string, Date> {
  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return range;
}

/**
 * GET /api/admin/reports/export — custom export builder: data source
 * (ledger|bookings), date range, region filter, CSV output. "Excel" is
 * substituted with CSV per the build spec (no xlsx dependency in the
 * project); real PDF generation is deferred for the same reason — noted
 * in the build report, not silently dropped.
 */
export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const { source, from, to, region } = req.query as unknown as ReportQuery;

  if (source === 'ledger') {
    const filter: Record<string, unknown> = {};
    const range = dateFilter(from, to);
    if (Object.keys(range).length) filter.timestamp = range;
    if (region) filter.region = region;

    const entries = await LedgerEntry.find(filter).sort({ timestamp: -1 }).limit(10000);
    const csv = toCsv(
      ['Timestamp', 'Type', 'Entity type', 'Entity ID', 'Amount', 'Status', 'Description', 'Region'],
      entries.map((e) => [
        e.timestamp.toISOString(),
        e.type,
        e.entityType,
        e.entityId.toString(),
        e.amount,
        e.status,
        e.description,
        e.region ?? '',
      ])
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-ledger-${Date.now()}.csv"`);
    res.status(200).send(csv);
    return;
  }

  if (source === 'bookings') {
    const filter: Record<string, unknown> = {};
    const range = dateFilter(from, to);
    if (Object.keys(range).length) filter.createdAt = range;
    if (region) filter.region = region;

    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).limit(10000);
    const csv = toCsv(
      ['Booking ID', 'Created', 'Type', 'Region', 'Status', 'Distance (km)', 'Fare total'],
      bookings.map((b) => [
        b._id.toString(),
        b.createdAt.toISOString(),
        b.type,
        b.region ?? '',
        b.status,
        b.distanceKm,
        b.fareBreakdown.total,
      ])
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="report-bookings-${Date.now()}.csv"`);
    res.status(200).send(csv);
    return;
  }

  throw new ApiError(400, 'Unknown data source');
});
