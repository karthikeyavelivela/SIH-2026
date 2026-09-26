'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { AddressField, type GeoPoint } from '@/components/booking/AddressField';
import { useCategoryName } from '@/lib/categoryName';

// Real service categories (serviceCategorySeed.ts) that institutions contract for.
const CATEGORIES = ['cleaner', 'general_labour', 'gardener', 'domestic_helper', 'caregiver', 'electrician', 'plumber', 'carpenter', 'painter', 'technician'] as const;
const DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

interface Society {
  _id: string;
  name: string;
  members: number;
  affiliated: boolean;
}

/**
 * P1.6 — an institution proposes a contract to a society. The rate is
 * checked against the statutory floor as the institution types it, so a
 * refusal arrives with its reason before anything is sent.
 */
export function ProposeContractForm({ onProposed }: { onProposed: () => void }) {
  const t = useTranslations('contracts.propose');
  const tDays = useTranslations('contracts.days');
  const categoryName = useCategoryName();
  const [where, setWhere] = useState<GeoPoint | null>(null);
  const [societies, setSocieties] = useState<Society[]>([]);
  const [muthaId, setMuthaId] = useState('');
  const [categorySlug, setCategorySlug] = useState<string>('cleaner');
  const [scope, setScope] = useState('');
  const [kind, setKind] = useState<'recurring' | 'one_off'>('recurring');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>('weekly');
  const [days, setDays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');
  const [durationHours, setDurationHours] = useState('4');
  const [workers, setWorkers] = useState('2');
  const [rate, setRate] = useState('');
  const [floorNote, setFloorNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const region = where?.region ?? '';

  useEffect(() => {
    api
      .get<{ societies: Society[] }>(`/api/contracts/societies${region ? `?region=${encodeURIComponent(region)}` : ''}`)
      .then((res) => setSocieties(res.societies))
      .catch(() => setSocieties([]));
  }, [region]);

  useEffect(() => {
    const r = Number(rate);
    const h = Number(durationHours);
    if (!region || !r || !h) {
      setFloorNote(null);
      return;
    }
    const id = setTimeout(() => {
      api
        .post<{ ok: boolean; problem: string | null }>('/api/contracts/check-rate', {
          categorySlug,
          region,
          ratePerWorkerPerVisit: r,
          schedule: { durationHours: h },
        })
        .then((res) => setFloorNote(res.problem))
        .catch(() => setFloorNote(null));
    }, 400);
    return () => clearTimeout(id);
  }, [rate, durationHours, categorySlug, region]);

  async function submit() {
    if (!where) return;
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/contracts', {
        muthaId,
        categorySlug,
        scope: scope.trim(),
        kind,
        schedule: {
          startDate,
          frequency: kind === 'recurring' ? frequency : undefined,
          daysOfWeek: kind === 'recurring' && frequency === 'weekly' ? days : undefined,
          dayOfMonth: kind === 'recurring' && frequency === 'monthly' ? Number(dayOfMonth) : undefined,
          time,
          durationHours: Number(durationHours),
        },
        workersPerVisit: Number(workers),
        ratePerWorkerPerVisit: Number(rate),
        region,
        location: { coordinates: [where.lng, where.lat], address: where.address },
      });
      onProposed();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  const perVisit = (Number(rate) || 0) * (Number(workers) || 0);
  const selectClass = 'rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm text-fy-ink';

  return (
    <Panel className="flex flex-col gap-3">
      <EyebrowLabel>{t('title')}</EyebrowLabel>
      <AddressField label={t('site')} placeholder={t('sitePlaceholder')} value={where} onChange={setWhere} markerColorClass="text-fy-brown" />

      <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
        {t('society')}
        <select value={muthaId} onChange={(e) => setMuthaId(e.target.value)} className={selectClass}>
          <option value="">{t('chooseSociety')}</option>
          {societies.map((s) => (
            <option key={s._id} value={s._id}>
              {s.name} · {t('members', { count: s.members })}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
        {t('work')}
        <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className={selectClass}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryName({ slug: c, name: c.replace(/_/g, ' ') })}
            </option>
          ))}
        </select>
      </label>
      <Field value={scope} onChange={(e) => setScope(e.target.value)} placeholder={t('scope')} aria-label={t('scope')} />

      <div className="flex gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as 'recurring' | 'one_off')} className={`flex-1 ${selectClass}`}>
          <option value="recurring">{t('recurring')}</option>
          <option value="one_off">{t('oneOff')}</option>
        </select>
        {kind === 'recurring' && (
          <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'monthly')} className={`flex-1 ${selectClass}`}>
            <option value="weekly">{t('weekly')}</option>
            <option value="monthly">{t('monthly')}</option>
          </select>
        )}
      </div>
      {kind === 'recurring' && frequency === 'weekly' && (
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}
              className={`rounded-full px-3 py-1 text-xs font-semibold border ${days.includes(d) ? 'bg-fy-brown text-fy-bone border-fy-brown' : 'border-fy-muted/30 text-fy-ink'}`}
            >
              {tDays(String(d))}
            </button>
          ))}
        </div>
      )}
      {kind === 'recurring' && frequency === 'monthly' && (
        <Field type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} aria-label={t('dayOfMonth')} placeholder={t('dayOfMonth')} />
      )}

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('startDate')}
          <Field type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('time')}
          <Field type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('hours')}
          <Field type="number" min={1} max={12} value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
          {t('workers')}
          <Field type="number" min={1} max={50} value={workers} onChange={(e) => setWorkers(e.target.value)} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-fy-ink-soft">
        {t('rate')}
        <Field type="number" min={1} value={rate} onChange={(e) => setRate(e.target.value)} placeholder="₹" />
      </label>
      {perVisit > 0 && <Body size="label">{t('perVisit', { amount: perVisit.toLocaleString('en-IN') })}</Body>}
      {floorNote && <p className="text-xs text-fy-on-error-bg">{floorNote}</p>}
      {error && <p className="text-xs text-fy-on-error-bg">{error}</p>}

      <Button disabled={busy || !where || !muthaId || scope.trim().length < 5 || !rate || !!floorNote} onClick={submit}>
        {busy ? t('sending') : t('send')}
      </Button>
    </Panel>
  );
}
