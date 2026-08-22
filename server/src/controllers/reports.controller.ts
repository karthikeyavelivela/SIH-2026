import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { LedgerEntry } from '../models/LedgerEntry';
import { Booking } from '../models/Booking';
import { generateReportPdf } from '../services/reportsPdf.service';

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
  format?: 'csv' | 'pdf';
}

function dateFilter(from?: string, to?: string): Record<string, Date> {
  const range: Record<string, Date> = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return range;
}

/**
 * GET /api/admin/reports/export — custom export builder: data source
 * (ledger|bookings), date range, region filter, CSV or PDF output.
 * "Excel" is substituted with CSV per the build spec (no xlsx dependency
 * in the project). PDF was previously deferred with an honest "no PDF
 * library in the project yet" notice in the UI — that was stale: pdfkit
 * was already a dependency (bolPdf.service.ts), so this closes the gap
 * for real rather than leaving the placeholder in place. PDF is capped at
 * 500 rows (see reportsPdf.service.ts) — a printable report, CSV stays
 * the tool for the full data set.
 */
export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const { source, from, to, region, format = 'csv' } = req.query as unknown as ReportQuery;

  let header: string[];
  let rows: (string | number)[][];
  let reportTitle: string;

  if (source === 'ledger') {
    const filter: Record<string, unknown> = {};
    const range = dateFilter(from, to);
    if (Object.keys(range).length) filter.timestamp = range;
    if (region) filter.region = region;

    const entries = await LedgerEntry.find(filter).sort({ timestamp: -1 }).limit(10000);
    header = ['Timestamp', 'Type', 'Entity type', 'Entity ID', 'Amount', 'Status', 'Description', 'Region'];
    rows = entries.map((e) => [
      e.timestamp.toISOString(),
      e.type,
      e.entityType,
      e.entityId.toString(),
      e.amount,
      e.status,
      e.description,
      e.region ?? '',
    ]);
    reportTitle = 'Financial Ledger Report';
  } else if (source === 'bookings') {
    const filter: Record<string, unknown> = {};
    const range = dateFilter(from, to);
    if (Object.keys(range).length) filter.createdAt = range;
    if (region) filter.region = region;

    const bookings = await Booking.find(filter).sort({ createdAt: -1 }).limit(10000);
    header = ['Booking ID', 'Created', 'Type', 'Region', 'Status', 'Distance (km)', 'Fare total'];
    rows = bookings.map((b) => [
      b._id.toString(),
      b.createdAt.toISOString(),
      b.type,
      b.region ?? '',
      b.status,
      b.distanceKm,
      b.fareBreakdown.total,
    ]);
    reportTitle = 'Bookings Report';
  } else {
    throw new ApiError(400, 'Unknown data source');
  }

  if (format === 'pdf') {
    const pdf = await generateReportPdf(reportTitle, header, rows);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${source}-${Date.now()}.pdf"`);
    res.status(200).send(pdf);
    return;
  }

  const csv = toCsv(header, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="report-${source}-${Date.now()}.csv"`);
  res.status(200).send(csv);
});
