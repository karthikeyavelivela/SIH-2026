'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { LayersIcon } from '@/components/ui/icons';

interface FareRule {
  _id: string;
  region: string;
  category: 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali';
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  surgeMultiplier: number;
  active: boolean;
}

const CATEGORY_VALUES: FareRule['category'][] = ['vehicle_small', 'vehicle_medium', 'vehicle_large', 'hamali'];

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

function ErrorAlert({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-ip-input border border-ip-error/30 bg-ip-error-container/40 px-4 py-3 text-sm text-ip-on-error-container">
      {message}
    </div>
  );
}

// Restyled onto the ip-* tonal system per DESIGN_INVENTORY.md's
// pricing_rules_configuration row — all fetch/mutation logic identical to
// before this pass.
export default function AdminFaresPage() {
  const t = useTranslations('adminFares');
  const CATEGORIES = CATEGORY_VALUES.map((value) => ({ value, label: t(`categories.${value}`) }));
  const [rules, setRules] = useState<FareRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    region: 'Visakhapatnam',
    category: 'vehicle_small' as FareRule['category'],
    baseFare: '',
    perKmRate: '',
    minimumFare: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.get<{ fareRules: FareRule[] }>('/api/admin/fare-rules');
    setRules(res.fareRules);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/fare-rules', {
        region: form.region,
        category: form.category,
        baseFare: Number(form.baseFare),
        perKmRate: Number(form.perKmRate),
        minimumFare: Number(form.minimumFare),
      });
      setForm({ ...form, baseFare: '', perKmRate: '', minimumFare: '' });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorCreate'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(rule: FareRule) {
    await api.patch(`/api/admin/fare-rules/${rule._id}`, { active: !rule.active });
    await load();
  }

  return (
    <div className="grid lg:grid-cols-2 gap-10 animate-[fadeUp_400ms_ease-out]">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
        <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
        <p className="text-sm text-ip-on-surface-variant mb-6">{t('subtitle')}</p>

        {loading && <Skeleton className="h-40" />}

        {!loading && rules.length === 0 && (
          <div className="ip-card">
            <EmptyState
              icon={<LayersIcon className="w-7 h-7" />}
              title={t('noRulesYet')}
              description={t('noRulesYetDesc')}
            />
          </div>
        )}

        <div className="space-y-3">
          {rules.map((r) => (
            <div key={r._id} className="ip-card">
              <div className="flex items-center justify-between mb-2">
                <p className="font-heading font-bold">{r.region}</p>
                <StatusChip tone={r.active ? 'success' : 'muted'}>{r.active ? t('active') : t('inactive')}</StatusChip>
              </div>
              <p className="text-sm text-ip-on-surface-variant mb-3 capitalize">{t(`categories.${r.category}`)}</p>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div>
                  <p className="text-xs text-ip-on-surface-variant">{t('base')}</p>
                  <p className="font-semibold">₹{r.baseFare}</p>
                </div>
                <div>
                  <p className="text-xs text-ip-on-surface-variant">{t('perKm')}</p>
                  <p className="font-semibold">₹{r.perKmRate}</p>
                </div>
                <div>
                  <p className="text-xs text-ip-on-surface-variant">{t('minimum')}</p>
                  <p className="font-semibold">₹{r.minimumFare}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(r)}
                className="text-xs font-semibold text-ip-primary hover:underline"
              >
                {r.active ? t('deactivate') : t('reactivate')}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-secondary mb-2">{t('addEyebrow')}</p>
        <h2 className="font-heading text-ip-headline-sm font-bold mb-1">{t('newRule')}</h2>
        <p className="text-sm text-ip-on-surface-variant mb-6">{t('newRuleSubtitle')}</p>
        <div className="ip-card">
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              placeholder={t('regionPlaceholder')}
              aria-label={t('regionPlaceholder')}
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
              className={inputClass}
              required
            />
            <select
              aria-label={t('categoryAria')}
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as FareRule['category'] })}
              className={inputClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              placeholder={t('baseFarePlaceholder')}
              aria-label={t('baseFarePlaceholder')}
              value={form.baseFare}
              onChange={(e) => setForm({ ...form, baseFare: e.target.value })}
              className={inputClass}
              required
              min={0}
            />
            <input
              type="number"
              placeholder={t('perKmPlaceholder')}
              aria-label={t('perKmPlaceholder')}
              value={form.perKmRate}
              onChange={(e) => setForm({ ...form, perKmRate: e.target.value })}
              className={inputClass}
              required
              min={0}
            />
            <input
              type="number"
              placeholder={t('minFarePlaceholder')}
              aria-label={t('minFarePlaceholder')}
              value={form.minimumFare}
              onChange={(e) => setForm({ ...form, minimumFare: e.target.value })}
              className={inputClass}
              required
              min={0}
            />
            {error && <ErrorAlert message={error} />}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? t('saving') : t('createRule')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
