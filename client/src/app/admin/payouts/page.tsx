'use client';

import { useState } from 'react';
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
        `${res.result.created} new payout${res.result.created === 1 ? '' : 's'} queued (₹${res.result.totalAmount}), ${res.result.skippedAlreadyExists} already existed this period, ${res.result.skippedZeroEarnings} had no earnings.`
      );
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not generate payouts.');
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
      setError(err instanceof ApiClientError ? err.message : 'Could not update this payout.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Finance</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Payout approvals</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">Queue of driver/Mutha payout requests.</p>

      <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s === '' ? 'All' : s}
            </FilterChip>
          ))}
        </div>
        <Button size="md" variant="ghost" disabled={generating} onClick={generate}>
          {generating ? 'Generating…' : 'Generate this period’s payouts'}
        </Button>
      </div>

      {generateResult && <p className="text-sm text-ip-on-surface-variant mb-4">{generateResult}</p>}
      {error && <p className="text-sm text-ip-error mb-4">{error}</p>}

      {state === 'loading' && !data && <Skeleton lines={3} className="h-20" />}

      {state !== 'loading' && payouts.length === 0 && (
        <div className="ip-card max-w-2xl">
          <EmptyState icon={<WalletIcon className="w-7 h-7" />} title="No payouts here" description="Nothing in this filter right now." />
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        {payouts.map((p) => (
          <div key={p._id} className="ip-card">
            <div className="flex items-center justify-between mb-2">
              <p className="font-heading font-bold">₹{p.amount}</p>
              <StatusChip tone={tone[p.status]}>{p.status}</StatusChip>
            </div>
            <p className="text-sm text-ip-on-surface-variant mb-1">
              {p.userId?.name ?? 'Unknown'} ({p.userId?.role}) · {p.period}
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
                  Reject
                </Button>
                <Button size="md" disabled={busyId === p._id} onClick={() => decide(p._id, 'approve')}>
                  Approve
                </Button>
              </div>
            )}
            {p.status === 'approved' && (
              <div className="pt-2 border-t border-ip-outline/10 mt-2">
                <Button size="md" disabled={busyId === p._id} onClick={() => decide(p._id, 'paid')}>
                  {busyId === p._id ? 'Marking…' : 'Mark paid'}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
