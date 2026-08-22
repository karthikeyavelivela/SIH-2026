'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { StatusChip } from '@/components/ui/StatusChip';
import { FilterChip } from '@/components/ui/FilterChip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { WalletIcon } from '@/components/ui/icons';

interface PayoutRow {
  _id: string;
  amount: number;
  period: string;
  status: 'pending' | 'approved' | 'rejected' | 'paid';
  breakdown: Record<string, number>;
  createdAt: string;
  userId: { name: string; phone: string; role: string } | null;
}

const STATUS_FILTERS = ['', 'pending', 'approved', 'rejected', 'paid'] as const;
const tone: Record<PayoutRow['status'], 'secondary' | 'success' | 'danger' | 'muted'> = {
  pending: 'secondary',
  approved: 'success',
  rejected: 'danger',
  paid: 'muted',
};

// New page — DESIGN_INVENTORY.md payout_approvals. Reads
// server/src/models/Payout.ts (new) via
// server/src/controllers/payout.controller.ts (new). Marking a payout
//'paid' also writes a LedgerEntry (ledger.service.writeLedgerEntry).
export default function AdminPayoutsPage() {
  const t = useTranslations('adminPayouts');
  const [status, setStatus] = useState<string>('pending');
  const { data, state, reload } = usePolling(
    () => api.get<{ payouts: PayoutRow[] }>(`/api/admin/payouts${status ? `?status=${status}` : ''}`),
    15000,
    [status]
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<string | null>(null);

  const payouts = data?.payouts ?? [];

  // AUDIT_REPORT.md Phase 1.5 — the queue above previously had nothing to
  // approve because nothing anywhere ever called Payout.create for a
  // regular earnings cycle. This is the trigger for the producer that
  // fixes that: admin-run (no real scheduler exists in this app — see
  // payoutGeneration.service.ts's doc comment), idempotent per worker per
  // period, safe to click more than once.
  async function generate() {
    setGenerating(true);
    setError(null);
    setGenerateResult(null);
    try {
      const res = await api.post<{
        result: { created: number; skippedAlreadyExists: number; skippedZeroEarnings: number; totalAmount: number };
      }>('/api/admin/payouts/generate');
      setGenerateResult(
        t('generateResult', {
          created: res.result.created,
          createdPlural: res.result.created === 1 ? '' : 's',
          total: res.result.totalAmount,
          existed: res.result.skippedAlreadyExists,
          zero: res.result.skippedZeroEarnings,
        })
      );
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorGenerate'));
    } finally {
      setGenerating(false);
    }
  }

  async function decide(id: string, action: 'approve' | 'reject' | 'paid') {
    setBusyId(id);
    setError(null);
    try {
      await api.patch(`/api/admin/payouts/${id}/${action}`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">{t('subtitle')}</p>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s === '' ? t('all') : t(`status.${s}`)}
            </FilterChip>
          ))}
        </div>
        <Button size="md" variant="ghost" disabled={generating} onClick={generate}>
          {generating ? t('generating') : t('generateButton')}
        </Button>
      </div>

      {generateResult && <p className="text-sm text-ip-on-surface-variant mb-4">{generateResult}</p>}
      {error && <p className="text-sm text-ip-error mb-4">{error}</p>}

      {state === 'loading' && !data && <Skeleton lines={3} className="h-20" />}

      {state !== 'loading' && payouts.length === 0 && (
        <div className="ip-card max-w-2xl">
          <EmptyState icon={<WalletIcon className="w-7 h-7" />} title={t('noPayouts')} description={t('noPayoutsDesc')} />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        {payouts.map((p) => (
          <div key={p._id} className="ip-card">
            <div className="flex items-center justify-between mb-2">
              <p className="font-heading font-bold">₹{p.amount}</p>
              <StatusChip tone={tone[p.status]}>{t(`status.${p.status}`)}</StatusChip>
            </div>
            <p className="text-sm text-ip-on-surface-variant mb-1">
              {p.userId?.name ?? t('unknown')} ({p.userId?.role}) · {p.period}
            </p>
            {Object.keys(p.breakdown).length > 0 && (
              <ul className="text-xs text-ip-on-surface-variant mb-3 space-y-0.5">
                {Object.entries(p.breakdown).map(([k, v]) => (
                  <li key={k} className="flex justify-between">
                    <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                    <span>₹{v}</span>
                  </li>
                ))}
              </ul>
            )}
            {p.status === 'pending' && (
              <div className="flex gap-2 pt-2 border-t border-ip-outline/10 mt-2">
                <Button variant="danger" size="md" disabled={busyId === p._id} onClick={() => decide(p._id, 'reject')}>
                  {t('reject')}
                </Button>
                <Button size="md" disabled={busyId === p._id} onClick={() => decide(p._id, 'approve')}>
                  {t('approve')}
                </Button>
              </div>
            )}
            {p.status === 'approved' && (
              <div className="pt-2 border-t border-ip-outline/10 mt-2">
                <Button size="md" disabled={busyId === p._id} onClick={() => decide(p._id, 'paid')}>
                  {busyId === p._id ? t('marking') : t('markPaid')}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
