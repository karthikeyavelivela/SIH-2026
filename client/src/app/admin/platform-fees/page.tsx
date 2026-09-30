'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Button } from '@/components/ui/Button';

interface Split {
  feeTotalPct: number;
  societyPct: number;
  welfarePoolPct: number;
  guaranteeReservePct: number;
  platformPct: number;
}

interface FeesResponse {
  split: Split;
  defaultSplit: Split;
  legacyCommissionPct: number;
  /** P1.3 — the guarantee reserve after re-work labour paid from it. */
  guaranteeReserve: number;
  collected: Partial<Record<'society_share' | 'welfare_pool_contribution' | 'guarantee_reserve' | 'platform_fee', { total: number; postings: number }>>;
}

const PARTS = ['societyPct', 'welfarePoolPct', 'guaranteeReservePct', 'platformPct'] as const;
const LEDGER_FOR: Record<(typeof PARTS)[number], keyof FeesResponse['collected']> = {
  societyPct: 'society_share',
  welfarePoolPct: 'welfare_pool_contribution',
  guaranteeReservePct: 'guarantee_reserve',
  platformPct: 'platform_fee',
};

const inputClass = 'w-24 rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm text-fy-ink tabular-nums';

/**
 * P1.1 — the customer's service fee and where it goes.
 *
 * The worker keeps 100% of their rate; the customer pays the fee on top.
 * The four parts must add up to the total — the server refuses otherwise —
 * and a change applies only to bookings priced after it: every booking
 * carries the split it was quoted at. The amounts collected so far are read
 * from the ledger, not estimated.
 */
export default function AdminPlatformFeesPage() {
  const t = useTranslations('adminPlatformFees');
  const { data, reload } = usePolling(() => api.get<FeesResponse>('/api/admin/platform-fees'), 60000);
  const [form, setForm] = useState<Split | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(data.split);
  }, [data, form]);

  const partsSum = form ? Math.round(PARTS.reduce((s, k) => s + (Number(form[k]) || 0), 0) * 100) / 100 : 0;
  const adds = form ? partsSum === Number(form.feeTotalPct) : false;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.put<{ split: Split }>('/api/admin/platform-fees', form);
      setForm(res.split);
      setSaved(true);
      reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  function set(key: keyof Split, value: string) {
    setSaved(false);
    setForm((f) => (f ? { ...f, [key]: value === '' ? ('' as unknown as number) : Number(value) } : f));
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('eyebrow')}</p>
        <h1 className="font-heading text-heading font-extrabold mb-1">{t('title')}</h1>
        <p className="text-sm text-fy-ink-soft max-w-2xl">{t('subtitle')}</p>
      </div>

      {!form || !data ? (
        <div className="h-48 rounded-card bg-fy-field animate-pulse max-w-3xl" />
      ) : (
        <form onSubmit={save} className="rounded-card border border-fy-muted/10 bg-fy-card p-5 flex flex-col gap-4 max-w-3xl">
          <label className="flex items-center justify-between gap-4 text-sm font-semibold text-fy-ink">
            {t('feeTotal')}
            <span className="flex items-center gap-2">
              <input type="number" min={0} max={50} step="0.01" className={inputClass} value={form.feeTotalPct} onChange={(e) => set('feeTotalPct', e.target.value)} />
              %
            </span>
          </label>

          <div className="flex flex-col gap-3 border-t border-fy-muted/10 pt-4">
            {PARTS.map((key) => {
              const collected = data.collected[LEDGER_FOR[key]];
              return (
                <label key={key} className="flex items-center justify-between gap-4 text-sm text-fy-ink-soft">
                  <span className="flex flex-col">
                    <span className="font-semibold text-fy-ink">{t(`parts.${key}`)}</span>
                    <span className="text-xs">{t(`partHints.${key}`)}</span>
                    <span className="text-xs tabular-nums">
                      {t('collected', { amount: collected?.total ?? 0, count: collected?.postings ?? 0 })}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <input type="number" min={0} max={50} step="0.01" className={inputClass} value={form[key]} onChange={(e) => set(key, e.target.value)} />
                    %
                  </span>
                </label>
              );
            })}
          </div>

          <p className={`text-sm ${adds ? 'text-fy-green' : 'text-fy-on-error-bg'}`}>
            {adds ? t('addsUp', { sum: partsSum }) : t('doesNotAdd', { sum: partsSum, total: form.feeTotalPct })}
          </p>
          <p className="text-xs text-fy-ink-soft">{t('forwardOnly')}</p>
          <p className="text-xs text-fy-ink-soft">{t('legacy', { pct: data.legacyCommissionPct })}</p>
          <p className="text-sm text-fy-ink">{t('reserveBalance', { amount: data.guaranteeReserve.toLocaleString('en-IN') })}</p>

          {error && (
            <p role="alert" className="rounded-control bg-fy-error-bg text-fy-on-error-bg px-4 py-3 text-sm">
              {error}
            </p>
          )}
          {saved && <p className="text-sm text-fy-green">{t('saved')}</p>}

          <div className="flex gap-3">
            <Button type="submit" disabled={saving || !adds}>
              {saving ? t('saving') : t('save')}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setForm(data.defaultSplit)}>
              {t('resetDefault')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
