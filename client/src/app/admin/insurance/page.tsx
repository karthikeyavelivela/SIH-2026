'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Skeleton } from '@/components/ui/Skeleton';

interface Plan {
  _id: string;
  name: string;
  type: 'standard' | 'parametric';
  category: string;
  coverageAmount: number;
  description: string;
  forRoles: string[];
  active: boolean;
  premium: number;
  defaultTrigger?: { condition: string; thresholdValue: number; periodDays: number; payoutAmount: number };
}

interface Monitor {
  todayTotal: number;
  dailyCap: number;
  envKillSwitchEnabled: boolean;
  dbKillSwitchEnabled: boolean;
}

const ROLES = ['driver', 'hamali_solo', 'mutha_leader', 'mutha_member', 'fleet_owner', 'warehouse_hub'];
const CATEGORY_VALUES = ['commercial_auto', 'work_compensation', 'cargo_transit'];

// Plan configuration doubles as the parametric trigger rule editor — a
// plan's defaultTrigger IS the rule every enrolment gets (see
// insurance.controller.ts's enrollInPlan). The manual review queue for
// escalated/pending automatic payouts is deliberately not duplicated
// here — it's the exact same records already served by
// /admin/payouts?source=parametric_insurance.
export default function AdminInsurancePage() {
  const t = useTranslations('adminInsurance');
  const { data: plansData, state: plansState, reload: reloadPlans } = usePolling(
    () => api.get<{ plans: Plan[] }>('/api/admin/insurance/plans'),
    30000
  );
  const { data: monitor, reload: reloadMonitor } = usePolling(
    () => api.get<Monitor>('/api/admin/insurance/payout-monitor'),
    15000
  );

  const [createOpen, setCreateOpen] = useState(false);
  const [togglingSwitch, setTogglingSwitch] = useState(false);

  async function toggleKillSwitch(enabled: boolean) {
    setTogglingSwitch(true);
    try {
      await api.patch('/api/admin/insurance/kill-switch', { enabled });
      await reloadMonitor();
    } finally {
      setTogglingSwitch(false);
    }
  }

  const plans = plansData?.plans ?? [];

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">{t('subtitle')}</p>

      {monitor && (
        <div className="ip-card max-w-2xl mb-8">
          <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-3">
            {t('autoPayoutsToday')}
          </p>
          <div className="flex items-center justify-between mb-3">
            <span className="text-2xl font-heading font-extrabold">
              ₹{monitor.todayTotal.toLocaleString('en-IN')}
              <span className="text-sm font-normal text-ip-on-surface-variant">{t('capLabel', { cap: monitor.dailyCap.toLocaleString('en-IN') })}</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-ip-surface-container-high overflow-hidden mb-4">
            <div
              className="h-full bg-ip-primary"
              style={{ width: `${Math.min(100, (monitor.todayTotal / monitor.dailyCap) * 100)}%` }}
            />
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-ip-outline/10">
            <div>
              <p className="text-sm font-medium">{t('runtimeKillSwitch')}</p>
              <p className="text-xs text-ip-on-surface-variant">
                {!monitor.envKillSwitchEnabled && t('deployOff')}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={monitor.dbKillSwitchEnabled}
              disabled={togglingSwitch || !monitor.envKillSwitchEnabled}
              onClick={() => toggleKillSwitch(!monitor.dbKillSwitchEnabled)}
              className={`relative w-12 h-7 rounded-full transition-colors disabled:opacity-40 ${
                monitor.dbKillSwitchEnabled ? 'bg-emerald-500' : 'bg-ip-error'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                  monitor.dbKillSwitchEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 max-w-4xl">
        <h2 className="font-heading text-lg font-bold">{t('plans')}</h2>
        <Button size="md" onClick={() => setCreateOpen(true)}>
          {t('newPlan')}
        </Button>
      </div>

      {plansState === 'loading' && <Skeleton lines={3} className="h-24" />}

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        {plans.map((p) => (
          <div key={p._id} className="ip-card">
            <div className="flex items-center justify-between mb-2">
              <p className="font-heading font-bold">{p.name}</p>
              <StatusChip tone={p.active ? 'success' : 'muted'}>{p.active ? t('active') : t('inactive')}</StatusChip>
            </div>
            <p className="text-xs text-ip-on-surface-variant mb-2">
              {t('planMeta', {
                type: p.type === 'parametric' ? t('parametric') : t('standard'),
                category: t(`categories.${p.category}`),
                premium: p.premium,
              })}
            </p>
            <p className="text-sm mb-2">{p.description}</p>
            {p.defaultTrigger && (
              <p className="text-xs text-ip-on-surface-variant bg-ip-surface-container rounded-ip-input px-2.5 py-1.5">
                {t('triggerLabel', {
                  condition: p.defaultTrigger.condition.replace(/_/g, ' '),
                  threshold: p.defaultTrigger.thresholdValue,
                  days: p.defaultTrigger.periodDays,
                  payout: p.defaultTrigger.payoutAmount,
                })}
              </p>
            )}
            <button
              type="button"
              onClick={async () => {
                await api.patch(`/api/admin/insurance/plans/${p._id}`, { active: !p.active });
                await reloadPlans();
              }}
              className="text-xs font-semibold text-ip-primary mt-2"
            >
              {p.active ? t('deactivate') : t('reactivate')}
            </button>
          </div>
        ))}
      </div>

      <CreatePlanModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={reloadPlans} />
    </div>
  );
}

function CreatePlanModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations('adminInsurance');
  const [name, setName] = useState('');
  const [type, setType] = useState<'standard' | 'parametric'>('parametric');
  const [category, setCategory] = useState('work_compensation');
  const [coverageAmount, setCoverageAmount] = useState('5000');
  const [premium, setPremium] = useState('50');
  const [description, setDescription] = useState('');
  const [forRoles, setForRoles] = useState<string[]>(['driver']);
  const [thresholdValue, setThresholdValue] = useState('8000');
  const [periodDays, setPeriodDays] = useState('30');
  const [payoutAmount, setPayoutAmount] = useState('2500');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function create() {
    setSaving(true);
    setError(null);
    try {
      await api.post('/api/admin/insurance/plans', {
        name,
        type,
        category,
        coverageAmount: Number(coverageAmount),
        premium: Number(premium),
        description,
        forRoles,
        ...(type === 'parametric'
          ? {
              defaultTrigger: {
                condition: 'earnings_below_threshold',
                thresholdValue: Number(thresholdValue),
                periodDays: Number(periodDays),
                payoutAmount: Number(payoutAmount),
              },
            }
          : {}),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorCreate'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('newPlanTitle')}>
      <div className="space-y-3">
        <input placeholder={t('namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} className="w-full min-h-[40px] px-3 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm" />
        <textarea placeholder={t('descriptionPlaceholder')} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm" />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as 'standard' | 'parametric')} className="flex-1 text-sm rounded-ip-input border border-ip-outline/20 bg-ip-surface px-3 py-2">
            <option value="parametric">{t('parametric')}</option>
            <option value="standard">{t('standard')}</option>
          </select>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="flex-1 text-sm rounded-ip-input border border-ip-outline/20 bg-ip-surface px-3 py-2">
            {CATEGORY_VALUES.map((c) => (
              <option key={c} value={c}>{t(`categories.${c}`)}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <input placeholder={t('coveragePlaceholder')} type="number" value={coverageAmount} onChange={(e) => setCoverageAmount(e.target.value)} className="flex-1 min-h-[40px] px-3 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm" />
          <input placeholder={t('premiumPlaceholder')} type="number" value={premium} onChange={(e) => setPremium(e.target.value)} className="flex-1 min-h-[40px] px-3 py-2 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm" />
        </div>
        <div>
          <p className="text-xs text-ip-on-surface-variant mb-1.5">{t('availableTo')}</p>
          <div className="flex flex-wrap gap-1.5">
            {ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setForRoles((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${forRoles.includes(r) ? 'border-ip-primary bg-ip-primary/10 text-ip-primary' : 'border-ip-outline/20 text-ip-on-surface-variant'}`}
              >
                {t(`roles.${r}`)}
              </button>
            ))}
          </div>
        </div>
        {type === 'parametric' && (
          <div className="rounded-ip-input bg-ip-surface-container p-3 space-y-2">
            <p className="text-xs font-semibold text-ip-on-surface-variant">{t('triggerHeading')}</p>
            <div className="flex gap-2">
              <input placeholder={t('thresholdPlaceholder')} type="number" value={thresholdValue} onChange={(e) => setThresholdValue(e.target.value)} className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-xs" />
              <input placeholder={t('periodPlaceholder')} type="number" value={periodDays} onChange={(e) => setPeriodDays(e.target.value)} className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-xs" />
              <input placeholder={t('payoutPlaceholder')} type="number" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} className="flex-1 min-h-[36px] px-2.5 py-1.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-xs" />
            </div>
          </div>
        )}
        {error && <p className="text-xs text-ip-error">{error}</p>}
        <Button className="w-full" disabled={saving || !name || forRoles.length === 0} onClick={create}>
          {saving ? t('creating') : t('createPlan')}
        </Button>
      </div>
    </Modal>
  );
}
