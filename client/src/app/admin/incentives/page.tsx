'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';

interface IncentiveRule {
  _id: string;
  minRatingAvg: number;
  minCompletedJobs: number;
  bonusAmount: number;
  region?: string;
  active: boolean;
}

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

// Restyled onto the ip-* tonal system per DESIGN_INVENTORY.md's
// payout_incentive_management row — all fetch/mutation logic identical to
// before this pass.
export default function AdminIncentivesPage() {
  const { data, reload } = usePolling(() => api.get<{ rules: IncentiveRule[] }>('/api/admin/incentives/rules'), 20000);
  const [form, setForm] = useState({ minRatingAvg: '4.5', minCompletedJobs: '10', bonusAmount: '500', region: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [runResult, setRunResult] = useState<{ totalGranted: number } | null>(null);
  const [running, setRunning] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/incentives/rules', {
        minRatingAvg: Number(form.minRatingAvg),
        minCompletedJobs: Number(form.minCompletedJobs),
        bonusAmount: Number(form.bonusAmount),
        region: form.region || undefined,
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not create rule');
    } finally {
      setSubmitting(false);
    }
  }

  async function deactivate(id: string) {
    await api.patch(`/api/admin/incentives/rules/${id}/deactivate`);
    await reload();
  }

  async function runNow() {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await api.post<{ totalGranted: number }>('/api/admin/incentives/run');
      setRunResult(res);
    } finally {
      setRunning(false);
    }
  }

  const rules = data?.rules ?? [];

  return (
    <div className="grid lg:grid-cols-2 gap-10 animate-[fadeUp_400ms_ease-out]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Rewards</p>
        <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Incentive rules</h1>
        <p className="text-sm text-ip-on-surface-variant mb-6">
          Rating + completed-job thresholds that grant a bonus. Run manually below (scheduled runs are a Phase 5+
          addition once a job scheduler exists).
        </p>

        <div className="space-y-3 mb-6">
          {rules.map((r) => (
            <div key={r._id} className="ip-card">
              <div className="flex items-center justify-between mb-2">
                <p className="font-heading font-bold">₹{r.bonusAmount} bonus</p>
                <StatusChip tone={r.active ? 'success' : 'muted'}>{r.active ? 'Active' : 'Inactive'}</StatusChip>
              </div>
              <p className="text-sm text-ip-on-surface-variant mb-2">
                Rating ≥ {r.minRatingAvg} · {r.minCompletedJobs}+ completed jobs{r.region ? ` · ${r.region}` : ''}
              </p>
              {r.active && (
                <button onClick={() => deactivate(r._id)} className="text-xs font-semibold text-ip-error hover:underline">
                  Deactivate
                </button>
              )}
            </div>
          ))}
          {rules.length === 0 && <p className="text-sm text-ip-on-surface-variant">No rules yet.</p>}
        </div>

        <div className="ip-card">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">Run all active rules now</p>
            <Button size="md" disabled={running} onClick={runNow}>
              {running ? 'Running…' : 'Run'}
            </Button>
          </div>
          {runResult && <p className="text-sm text-ip-on-surface-variant">Granted {runResult.totalGranted} new incentive(s).</p>}
        </div>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-secondary mb-2">Add</p>
        <h2 className="font-heading text-ip-headline-sm font-bold mb-1">New rule</h2>
        <p className="text-sm text-ip-on-surface-variant mb-6">Applies to drivers, solo Hamalis, Mutha members, and Muthas.</p>
        <div className="ip-card">
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              type="number"
              step="0.1"
              min={0}
              max={5}
              placeholder="Minimum rating (0-5)"
              aria-label="Minimum rating"
              value={form.minRatingAvg}
              onChange={(e) => setForm({ ...form, minRatingAvg: e.target.value })}
              className={inputClass}
              required
            />
            <input
              type="number"
              min={0}
              placeholder="Minimum completed jobs"
              aria-label="Minimum completed jobs"
              value={form.minCompletedJobs}
              onChange={(e) => setForm({ ...form, minCompletedJobs: e.target.value })}
              className={inputClass}
              required
            />
            <input
              type="number"
              min={0}
              placeholder="Bonus amount (₹)"
              aria-label="Bonus amount"
              value={form.bonusAmount}
              onChange={(e) => setForm({ ...form, bonusAmount: e.target.value })}
              className={inputClass}
              required
            />
            <input
              placeholder="Region (optional)"
              aria-label="Region"
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className={inputClass}
            />
            {error && <p className="text-sm text-ip-error">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create rule'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
