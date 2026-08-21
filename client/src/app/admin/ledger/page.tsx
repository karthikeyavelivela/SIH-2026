'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable } from '@/components/admin/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { FilterChip } from '@/components/ui/FilterChip';
import { Button } from '@/components/ui/Button';
import { WalletIcon } from '@/components/ui/icons';

interface LedgerEntry {
  _id: string;
  type: 'revenue' | 'payout' | 'fee' | 'refund';
  entityType: string;
  entityId: string;
  amount: number;
  status: 'posted' | 'pending' | 'failed';
  description: string;
  region?: string;
  timestamp: string;
}

const TYPES = ['', 'revenue', 'payout', 'fee', 'refund'] as const;

const statusTone: Record<LedgerEntry['status'], 'success' | 'secondary' | 'danger'> = {
  posted: 'success',
  pending: 'secondary',
  failed: 'danger',
};

// New page — DESIGN_INVENTORY.md financial_transaction_ledger. Reads from
// server/src/models/LedgerEntry.ts (new, append-only — see model comment)
// via server/src/controllers/ledger.controller.ts (new). Renders an
// EmptyState gracefully on a fresh/empty ledger; no fabricated numbers.
export default function AdminLedgerPage() {
  const [type, setType] = useState<string>('');
  const [page, setPage] = useState(1);
  const { data, state } = usePolling(
    () =>
      api.get<{
        entries: LedgerEntry[];
        total: number;
        page: number;
        limit: number;
        summary: Record<string, number>;
      }>(`/api/admin/ledger?page=${page}${type ? `&type=${type}` : ''}`),
    20000,
    [type, page]
  );

  const entries = data?.entries ?? [];
  const summary = data?.summary ?? { revenue: 0, payout: 0, fee: 0, refund: 0 };
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function exportCsv() {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';
    window.open(`${base}/api/admin/ledger/export?${params.toString()}`, '_blank');
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Finance</p>
          <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Transaction ledger</h1>
          <p className="text-sm text-ip-on-surface-variant">Append-only platform financial record.</p>
        </div>
        <Button variant="ghost" onClick={exportCsv}>
          Export CSV
        </Button>
      </div>

      <div className="grid sm:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Revenue" value={`₹${summary.revenue}`} icon={<WalletIcon className="w-5 h-5" />} />
        <MetricCard label="Payouts" value={`₹${summary.payout}`} icon={<WalletIcon className="w-5 h-5" />} />
        <MetricCard label="Fees" value={`₹${summary.fee}`} icon={<WalletIcon className="w-5 h-5" />} />
        <MetricCard label="Refunds" value={`₹${summary.refund}`} icon={<WalletIcon className="w-5 h-5" />} />
      </div>

      <div className="flex gap-2 mb-5">
        {TYPES.map((t) => (
          <FilterChip
            key={t}
            active={type === t}
            onClick={() => {
              setPage(1);
              setType(t);
            }}
          >
            {t === '' ? 'All' : t}
          </FilterChip>
        ))}
      </div>

      <DataTable<LedgerEntry>
        rows={entries}
        rowKey={(e) => e._id}
        loading={state === 'loading' && entries.length === 0}
        emptyTitle="No ledger entries yet"
        emptyDescription="Entries appear here as real bookings, payouts, fees, and refunds are recorded."
        columns={[
          { key: 'time', header: 'Time', render: (e) => <span className="whitespace-nowrap text-ip-on-surface-variant">{new Date(e.timestamp).toLocaleString('en-IN')}</span> },
          { key: 'type', header: 'Type', render: (e) => <span className="capitalize font-medium">{e.type}</span> },
          { key: 'desc', header: 'Description', render: (e) => e.description },
          { key: 'entity', header: 'Entity', render: (e) => <span className="text-ip-on-surface-variant">{e.entityType} · {e.entityId.slice(-6)}</span> },
          {
            key: 'amount',
            header: 'Amount',
            render: (e) => (
              <span className={`font-semibold tabular-nums ${e.amount < 0 ? 'text-ip-error' : 'text-ip-on-surface'}`}>
                {e.amount < 0 ? '-' : ''}₹{Math.abs(e.amount)}
              </span>
            ),
          },
          { key: 'status', header: 'Status', render: (e) => <StatusChip tone={statusTone[e.status]}>{e.status}</StatusChip> },
        ]}
      />

      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm font-medium text-ip-primary disabled:text-ip-on-surface-variant disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-ip-on-surface-variant">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-sm font-medium text-ip-primary disabled:text-ip-on-surface-variant disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
