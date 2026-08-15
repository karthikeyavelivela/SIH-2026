'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
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
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

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
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">Rewards</p>
        <h1 className="font-heading text-2xl font-bold mb-1">Incentive rules</h1>
        <p className="text-sm text-text-muted mb-6">
          Rating + completed-job thresholds that grant a bonus. Run manually below (scheduled runs are a Phase 5+
          addition once a job scheduler exists).
        </p>

        <div className="space-y-3 mb-6">
          {rules.map((r) => (
            <Card key={r._id} elevation="raised">
              <div className="flex items-center justify-between mb-2">
                <p className="font-heading font-bold">₹{r.bonusAmount} bonus</p>
                <Badge tone={r.active ? 'success' : 'muted'}>{r.active ? 'Active' : 'Inactive'}</Badge>
              </div>
              <p className="text-sm text-text-muted mb-2">
                Rating ≥ {r.minRatingAvg} · {r.minCompletedJobs}+ completed jobs{r.region ? ` · ${r.region}` : ''}
              </p>
              {r.active && (
                <button onClick={() => deactivate(r._id)} className="text-xs font-semibold text-red-600 hover:underline">
                  Deactivate
                </button>
              )}
            </Card>
          ))}
          {rules.length === 0 && <p className="text-sm text-text-muted">No rules yet.</p>}
        </div>

        <Card elevation="raised">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">Run all active rules now</p>
            <Button size="md" disabled={running} onClick={runNow}>
              {running ? 'Running…' : 'Run'}
            </Button>
          </div>
          {runResult && <p className="text-sm text-text-muted">Granted {runResult.totalGranted} new incentive(s).</p>}
        </Card>
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-secondary-600 mb-2">Add</p>
        <h2 className="font-heading text-xl font-bold mb-1">New rule</h2>
        <p className="text-sm text-text-muted mb-6">Applies to drivers, solo Hamalis, Mutha members, and Muthas.</p>
        <Card elevation="raised">
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
            {error && <p className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? 'Saving…' : 'Create rule'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
