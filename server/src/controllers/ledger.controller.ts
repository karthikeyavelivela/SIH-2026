import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { LedgerEntry, LedgerEntryType } from '../models/LedgerEntry';

interface LedgerFilters {
  type?: LedgerEntryType;
  from?: string;
  to?: string;
}

function buildFilter(query: Record<string, string>): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.type) filter.type = query.type;
  const range: Record<string, Date> = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) range.$lte = new Date(query.to);
  if (Object.keys(range).length) filter.timestamp = range;
  return filter;
}

/** GET /api/admin/ledger — paginated, filterable by type + date range. */
export const listLedger = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '50' } = req.query as Record<string, string>;
  const filter = buildFilter(req.query as Record<string, string>);
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

  const [entries, total, summaryAgg] = await Promise.all([
    LedgerEntry.find(filter)
      .sort({ timestamp: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    LedgerEntry.countDocuments(filter),
    LedgerEntry.aggregate([
      { $match: filter },
      { $group: { _id: '$type', total: { $sum: '$amount' } } },
    ]),
  ]);

  const summary: Record<string, number> = {
    revenue: 0,
    payout: 0,
    fee: 0,
    refund: 0,
    commission: 0,
    welfare_fund: 0,
    equity: 0,
    surplus: 0,
  };
  for (const row of summaryAgg as { _id: LedgerEntryType; total: number }[]) {
    summary[row._id] = Math.round(row.total * 100) / 100;
  }

  res.status(200).json({ entries, total, page: pageNum, limit: limitNum, summary });
});

function csvEscape(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** GET /api/admin/ledger/export — same filters as listLedger, no pagination, returns CSV. */
export const exportLedgerCsv = asyncHandler(async (req: Request, res: Response) => {
  const filter = buildFilter(req.query as Record<string, string>);
  const entries = await LedgerEntry.find(filter).sort({ timestamp: -1 }).limit(10000);

  const header = ['Timestamp', 'Type', 'Entity type', 'Entity ID', 'Amount', 'Status', 'Description', 'Region'];
  const rows = entries.map((e) =>
    [
      e.timestamp.toISOString(),
      e.type,
      e.entityType,
      e.entityId.toString(),
      e.amount,
      e.status,
      e.description,
      e.region ?? '',
    ]
      .map(csvEscape)
      .join(',')
  );
  const csv = [header.join(','), ...rows].join('\n');

  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ledger-export-${Date.now()}.csv"`);
  res.send(csv);
});
