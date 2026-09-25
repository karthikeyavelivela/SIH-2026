'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { DataTable } from '@/components/admin/DataTable';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';

type Status = 'in_force' | 'stale' | 'scheduled' | 'retired';

interface FloorRow {
  _id: string;
  state: string;
  zone: 'zone_1' | 'zone_2' | 'zone_3';
  skillBand: 'unskilled' | 'semi_skilled' | 'skilled' | 'highly_skilled';
  monthlyRate: number;
  hourlyRate: number;
  notificationNumber: string;
  effectiveFrom: string;
  effectiveUntil?: string;
  sourceType: 'gazette' | 'department_website' | 'secondary_compilation';
  source: string;
  status: Status;
  active: boolean;
}

const TONE: Record<Status, 'success' | 'danger' | 'secondary' | 'muted'> = {
  in_force: 'success',
  stale: 'danger',
  scheduled: 'secondary',
  retired: 'muted',
};

const ZONES = ['zone_1', 'zone_2', 'zone_3'] as const;
const BANDS = ['unskilled', 'semi_skilled', 'skilled', 'highly_skilled'] as const;
const SOURCES = ['gazette', 'department_website', 'secondary_compilation'] as const;

const inputClass = 'rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm text-fy-ink';

/**
 * The statutory wage floors, as an admin manages them.
 *
 * Every row ever entered is listed — retired ones too — because "what was
 * the floor last April" is the question a wage dispute turns on. New
 * notifications supersede the old row rather than editing it; a row entered
 * in error is deactivated with a reason. Both are audited server-side.
 * Daily and hourly figures are derived on the server from the monthly one,
 * so a typo cannot become the enforced number.
 */
export default function AdminWageFloorsPage() {
  const t = useTranslations('adminWageFloors');
  const { data, reload } = usePolling(
    () => api.get<{ floors: FloorRow[]; staleStates: string[] }>('/api/admin/wage-floors'),
    60000
  );
  const floors = data?.floors ?? [];
  const [form, setForm] = useState({
    state: 'Andhra Pradesh',
    zone: 'zone_1' as (typeof ZONES)[number],
    skillBand: 'unskilled' as (typeof BANDS)[number],
    monthlyRate: '',
    scheduledEmployment: '',
    notificationNumber: '',
    notificationDate: '',
    effectiveFrom: '',
    effectiveUntil: '',
    sourceType: 'gazette' as (typeof SOURCES)[number],
    sourceUrl: '',
    sourceNote: '',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.post('/api/admin/wage-floors', {
        ...form,
        monthlyRate: Number(form.monthlyRate),
        effectiveUntil: form.effectiveUntil || undefined,
        sourceUrl: form.sourceUrl || undefined,
        sourceNote: form.sourceNote || undefined,
      });
      setMessage({ ok: true, text: t('published') });
      await reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiClientError ? err.message : t('error') });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(row: FloorRow) {
    const reason = window.prompt(t('deactivatePrompt'));
    if (!reason) return;
    try {
      await api.patch(`/api/admin/wage-floors/${row._id}/deactivate`, { reason });
      await reload();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiClientError ? err.message : t('error') });
    }
  }

  const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-IN') : '—');

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('eyebrow')}</p>
        <h1 className="font-heading text-heading font-extrabold mb-1">{t('title')}</h1>
        <p className="text-sm text-fy-ink-soft max-w-2xl">{t('subtitle')}</p>
      </div>

      {data && data.staleStates.length > 0 && (
        <p role="alert" className="mb-5 rounded-control bg-fy-error-bg text-fy-on-error-bg px-4 py-3 text-sm">
          {t('staleAlert', { states: data.staleStates.join(', ') })}
        </p>
      )}

      <DataTable<FloorRow>
        rows={floors}
        rowKey={(r) => r._id}
        loading={!data}
        emptyTitle={t('empty')}
        columns={[
          { key: 'state', header: t('state'), render: (r) => r.state },
          { key: 'zone', header: t('zone'), render: (r) => t(`zones.${r.zone}`) },
          { key: 'band', header: t('band'), render: (r) => t(`bands.${r.skillBand}`) },
          { key: 'monthly', header: t('monthly'), render: (r) => <span className="tabular-nums">₹{r.monthlyRate.toLocaleString('en-IN')}</span> },
          { key: 'hourly', header: t('hourly'), render: (r) => <span className="tabular-nums">₹{r.hourlyRate}</span> },
          { key: 'period', header: t('period'), render: (r) => `${day(r.effectiveFrom)} – ${day(r.effectiveUntil)}` },
          { key: 'source', header: t('source'), render: (r) => <span className="text-xs text-fy-ink-soft">{r.source}</span> },
          { key: 'status', header: t('status'), render: (r) => <StatusChip tone={TONE[r.status]}>{t(`statuses.${r.status}`)}</StatusChip> },
          {
            key: 'action',
            header: '',
            render: (r) =>
              r.active ? (
                <button type="button" onClick={() => deactivate(r)} className="text-sm font-semibold text-fy-brown hover:underline">
                  {t('deactivate')}
                </button>
              ) : null,
          },
        ]}
      />

      <form onSubmit={publish} className="mt-10 rounded-card border border-fy-muted/10 bg-fy-card p-5 grid sm:grid-cols-2 gap-4 max-w-3xl">
        <h2 className="sm:col-span-2 font-heading text-title">{t('newTitle')}</h2>
        <p className="sm:col-span-2 text-sm text-fy-ink-soft">{t('newHint')}</p>

        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('state')}
          <input required className={inputClass} value={form.state} onChange={(e) => set('state', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('zone')}
          <select className={inputClass} value={form.zone} onChange={(e) => set('zone', e.target.value as typeof form.zone)}>
            {ZONES.map((z) => (
              <option key={z} value={z}>{t(`zones.${z}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('band')}
          <select className={inputClass} value={form.skillBand} onChange={(e) => set('skillBand', e.target.value as typeof form.skillBand)}>
            {BANDS.map((b) => (
              <option key={b} value={b}>{t(`bands.${b}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('monthly')}
          <input required type="number" min={1} className={inputClass} value={form.monthlyRate} onChange={(e) => set('monthlyRate', e.target.value)} />
        </label>
        <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('scheduledEmployment')}
          <input required className={inputClass} value={form.scheduledEmployment} onChange={(e) => set('scheduledEmployment', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('notificationNumber')}
          <input required className={inputClass} value={form.notificationNumber} onChange={(e) => set('notificationNumber', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('notificationDate')}
          <input required type="date" className={inputClass} value={form.notificationDate} onChange={(e) => set('notificationDate', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('effectiveFrom')}
          <input required type="date" className={inputClass} value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('effectiveUntil')}
          <input type="date" className={inputClass} value={form.effectiveUntil} onChange={(e) => set('effectiveUntil', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('sourceType')}
          <select className={inputClass} value={form.sourceType} onChange={(e) => set('sourceType', e.target.value as typeof form.sourceType)}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{t(`sources.${s}`)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('sourceUrl')}
          <input type="url" className={inputClass} value={form.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} />
        </label>
        <label className="sm:col-span-2 flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('sourceNote')}
          <textarea rows={2} className={inputClass} value={form.sourceNote} onChange={(e) => set('sourceNote', e.target.value)} />
        </label>

        {message && (
          <p role="status" className={`sm:col-span-2 text-sm ${message.ok ? 'text-fy-green' : 'text-fy-on-error-bg bg-fy-error-bg rounded-control px-3 py-2'}`}>
            {message.text}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            {t('publish')}
          </Button>
        </div>
      </form>
    </div>
  );
}
