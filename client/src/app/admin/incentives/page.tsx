'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('adminIncentives');
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
      setError(err instanceof ApiClientError ? err.message : t('errorCreate'));
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
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
        <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
        <p className="text-sm text-ip-on-surface-variant mb-6">{t('subtitle')}</p>

        <div className="space-y-3 mb-6">
          {rules.map((r) => (
            <div key={r._id} className="ip-card">
              <div className="flex items-center justify-between mb-2">
                <p className="font-heading font-bold">{t('bonusLabel', { amount: r.bonusAmount })}</p>
                <StatusChip tone={r.active ? 'success' : 'muted'}>{r.active ? t('active') : t('inactive')}</StatusChip>
              </div>
              <p className="text-sm text-ip-on-surface-variant mb-2">
                {t('ruleSummary', { rating: r.minRatingAvg, jobs: r.minCompletedJobs, region: r.region ? ` · ${r.region}` : '' })}
              </p>
              {r.active && (
                <button onClick={() => deactivate(r._id)} className="text-xs font-semibold text-ip-error hover:underline">
                  {t('deactivate')}
                </button>
              )}
            </div>
          ))}
          {rules.length === 0 && <p className="text-sm text-ip-on-surface-variant">{t('noRulesYet')}</p>}
        </div>

        <div className="ip-card">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">{t('runAllNow')}</p>
            <Button size="md" disabled={running} onClick={runNow}>
              {running ? t('running') : t('run')}
            </Button>
          </div>
          {runResult && <p className="text-sm text-ip-on-surface-variant">{t('grantedResult', { count: runResult.totalGranted })}</p>}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-secondary mb-2">{t('addEyebrow')}</p>
        <h2 className="font-heading text-ip-headline-sm font-bold mb-1">{t('newRule')}</h2>
        <p className="text-sm text-ip-on-surface-variant mb-6">{t('newRuleSubtitle')}</p>
        <div className="ip-card">
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              type="number"
              step="0.1"
              min={0}
              max={5}
              placeholder={t('minRatingPlaceholder')}
              aria-label={t('minRatingPlaceholder')}
              value={form.minRatingAvg}
              onChange={(e) => setForm({ ...form, minRatingAvg: e.target.value })}
              className={inputClass}
              required
            />
            <input
              type="number"
              min={0}
              placeholder={t('minJobsPlaceholder')}
              aria-label={t('minJobsPlaceholder')}
              value={form.minCompletedJobs}
              onChange={(e) => setForm({ ...form, minCompletedJobs: e.target.value })}
              className={inputClass}
              required
            />
            <input
              type="number"
              min={0}
              placeholder={t('bonusPlaceholder')}
              aria-label={t('bonusPlaceholder')}
              value={form.bonusAmount}
              onChange={(e) => setForm({ ...form, bonusAmount: e.target.value })}
              className={inputClass}
              required
            />
            <input
              placeholder={t('regionPlaceholder')}
              aria-label={t('regionPlaceholder')}
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className={inputClass}
            />
            {error && <p className="text-sm text-ip-error">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? t('saving') : t('createRule')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
