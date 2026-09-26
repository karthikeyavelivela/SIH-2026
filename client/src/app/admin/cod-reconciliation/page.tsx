'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, API_BASE } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MetricCard } from '@/components/ui/MetricCard';
import { DataTable } from '@/components/admin/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { WalletIcon, AlertIcon } from '@/components/ui/icons';

interface Row {
  paymentId: string;
  bookingId: string;
  region: string | null;
  amount: number;
  status: 'pending' | 'success' | 'failed' | 'refunded';
  createdAt: string;
  capturedAt: string | null;
  confirmedBy: string | null;
  ledgerPosted: boolean;
}

interface Report {
  rows: Row[];
  totals: {
    count: number;
    pendingCount: number;
    pendingAmount: number;
    confirmedCount: number;
    confirmedAmount: number;
    confirmedNotPostedCount: number;
    confirmedNotPostedAmount: number;
  };
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

/**
 * Cash on delivery, reconciled.
 *
 * Cash is the one payment the platform never touches: the customer hands it
 * to the worker, and the worker's confirmation is the only record it moved.
 * This screen lists every COD payment in a date range and puts the three
 * numbers that matter first — cash still with workers, cash confirmed and
 * posted to the ledger, and cash confirmed but NOT posted. The last should
 * always be zero; anything else is shown in red with the rows to chase.
 */
export default function CodReconciliationPage() {
  const t = useTranslations('codReconciliation');
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 30 * 86400_000)));
  const [to, setTo] = useState(isoDay(new Date(today.getTime() + 86400_000)));

  const query = `from=${from}&to=${to}`;
  const { data, state } = usePolling(
    () => api.get<Report>(`/api/admin/payments/cod-reconciliation?${query}`),
    60000,
    [query]
  );
  const totals = data?.totals;
  const rows = data?.rows ?? [];

  function exportCsv() {
    window.open(`${API_BASE}/api/admin/payments/cod-reconciliation?${query}&format=csv`, '_blank');
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('eyebrow')}</p>
          <h1 className="font-heading text-heading font-extrabold mb-1">{t('title')}</h1>
          <p className="text-sm text-fy-ink-soft max-w-xl">{t('subtitle')}</p>
        </div>
        <Button variant="ghost" onClick={exportCsv}>
          {t('exportCsv')}
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('from')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm text-fy-ink" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('to')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm text-fy-ink" />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <MetricCard
          label={t('withWorkers')}
          value={`₹${totals?.pendingAmount ?? 0}`}
          icon={<WalletIcon className="w-5 h-5" />}
        />
        <MetricCard
          label={t('confirmedPosted')}
          value={`₹${totals ? Math.round((totals.confirmedAmount - totals.confirmedNotPostedAmount) * 100) / 100 : 0}`}
          icon={<WalletIcon className="w-5 h-5" />}
        />
        <MetricCard
          label={t('confirmedNotPosted')}
          value={`₹${totals?.confirmedNotPostedAmount ?? 0}`}
          icon={<AlertIcon className="w-5 h-5" />}
        />
      </div>

      {totals && totals.confirmedNotPostedCount > 0 && (
        <p role="alert" className="mb-5 rounded-control bg-fy-error-bg text-fy-on-error-bg px-4 py-3 text-sm">
          {t('mismatchAlert', { count: totals.confirmedNotPostedCount })}
        </p>
      )}

      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.paymentId}
        loading={state === 'loading' && rows.length === 0}
        emptyTitle={t('empty')}
        columns={[
          { key: 'created', header: t('created'), render: (r) => <span className="whitespace-nowrap text-fy-ink-soft">{new Date(r.createdAt).toLocaleString('en-IN')}</span> },
          { key: 'booking', header: t('booking'), render: (r) => <span className="font-mono text-xs">{r.bookingId.slice(-8).toUpperCase()}</span> },
          { key: 'region', header: t('region'), render: (r) => r.region ?? '—' },
          { key: 'amount', header: t('amount'), render: (r) => <span className="font-semibold tabular-nums">₹{r.amount}</span> },
          {
            key: 'status',
            header: t('status'),
            render: (r) => (
              <StatusChip tone={r.status === 'success' ? (r.ledgerPosted ? 'success' : 'danger') : 'secondary'}>
                {r.status === 'success' ? (r.ledgerPosted ? t('statusPosted') : t('statusNotPosted')) : t('statusPending')}
              </StatusChip>
            ),
          },
          { key: 'captured', header: t('confirmedAt'), render: (r) => (r.capturedAt ? new Date(r.capturedAt).toLocaleString('en-IN') : '—') },
        ]}
      />
    </div>
  );
}
