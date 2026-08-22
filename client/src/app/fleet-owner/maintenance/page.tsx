'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { CircularGauge } from '@/components/ui/CircularGauge';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { Timeline } from '@/components/ui/Timeline';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { ChecklistItem } from '@/components/ui/ChecklistItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { AlertIcon, ClockIcon } from '@/components/ui/icons';

type ScheduleStatus = 'upcoming' | 'due' | 'overdue' | 'completed';

interface ScheduleDoc {
  _id: string;
  vehicleId: { _id: string; registrationNumber: string; type: string } | string;
  type: 'mileage_triggered' | 'date_triggered';
  dueAt?: string;
  dueMileageKm?: number;
  description: string;
  status: ScheduleStatus;
}

interface HealthResponse {
  healthPct: number;
  totalVehicles: number;
  vehiclesNeedingAttention: number;
  nextService: ScheduleDoc | null;
}

interface FleetVehicleOption {
  _id: string;
  registrationNumber: string;
}

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

function vehicleLabel(v: ScheduleDoc['vehicleId']): string {
  return typeof v === 'string' ? v : v.registrationNumber;
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function FleetMaintenancePage() {
  const t = useTranslations('fleetMaintenance');
  const { data: health, state: healthState, reload: reloadHealth } = usePolling(
    () => api.get<HealthResponse>('/api/fleet/health'),
    20000
  );
  const { data: scheduleData, state: scheduleState, reload: reloadSchedules } = usePolling(
    () => api.get<{ schedules: ScheduleDoc[] }>('/api/fleet/maintenance'),
    20000
  );
  const { data: fleetData } = usePolling(
    () => api.get<{ fleet: { vehicleIds: FleetVehicleOption[] } }>('/api/fleet/me'),
    60000
  );

  const [bookOpen, setBookOpen] = useState(false);
  const [form, setForm] = useState({ vehicleId: '', description: '', dueAt: '' });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const schedules = scheduleData?.schedules ?? [];
  const vehicles = fleetData?.fleet.vehicleIds ?? [];

  async function reloadAll() {
    await Promise.all([reloadHealth(), reloadSchedules()]);
  }

  async function handleBookRepair(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post(`/api/fleet/vehicles/${form.vehicleId}/maintenance`, {
        type: 'date_triggered',
        dueAt: form.dueAt,
        description: form.description,
      });
      setForm({ vehicleId: '', description: '', dueAt: '' });
      setBookOpen(false);
      await reloadAll();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorBook'));
    } finally {
      setSubmitting(false);
    }
  }

  async function markCompleted(scheduleId: string) {
    setSubmitting(true);
    try {
      await api.patch(`/api/fleet/maintenance/${scheduleId}`, { status: 'completed' });
      await reloadAll();
    } catch {
      // Surfaced via the row staying in its current state — no dedicated
      // error UI needed for a quick inline action like this.
    } finally {
      setSubmitting(false);
    }
  }

  const critical = schedules.filter((s) => s.status === 'overdue' || s.status === 'due');
  const openSchedules = schedules.filter((s) => s.status !== 'completed');

  const timelineEvents = openSchedules.map((s) => ({
    id: s._id,
    label: `${s.description} — ${vehicleLabel(s.vehicleId)}`,
    timestamp: s.type === 'date_triggered' ? formatDate(s.dueAt) : `${s.dueMileageKm ?? '?'} km`,
    tone: s.status === 'overdue' ? ('danger' as const) : s.status === 'due' ? ('primary' as const) : ('default' as const),
  }));

  return (
    <div className="max-w-3xl mx-auto animate-[fadeUp_400ms_ease-out]">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
          <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
          <p className="text-sm text-ip-on-surface-variant">{t('subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => { setFormError(null); setBookOpen(true); }}>
          {t('bookRepair')}
        </Button>
      </div>

      {critical.length > 0 && (
        <AlertBanner tone="danger" icon={<AlertIcon className="w-4 h-4" />} className="mb-6">
          <span className="font-semibold">{t('actionRequired')}</span>{' '}
          {t('unitsNeedAttention', {
            count: critical.length,
            unitPlural: critical.length === 1 ? '' : 's',
            needsPlural: critical.length === 1 ? 's' : '',
          })}{' '}
          {critical.map((s) => vehicleLabel(s.vehicleId)).join(', ')}.
        </AlertBanner>
      )}

      {healthState === 'loading' ? (
        <Skeleton className="h-40 mb-8" />
      ) : (
        <div className="grid sm:grid-cols-2 gap-4 mb-8">
          <div className="ip-card flex items-center gap-5">
            <CircularGauge value={health?.healthPct ?? 100} accent={((health?.healthPct ?? 100) < 70 ? 'error' : 'primary')} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1">{t('fleetHealth')}</p>
              <p className="text-sm text-ip-on-surface-variant">
                {t('unitsNeedAttentionOf', { needing: health?.vehiclesNeedingAttention ?? 0, total: health?.totalVehicles ?? 0 })}
              </p>
            </div>
          </div>
          <div className="ip-card">
            <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">{t('nextService')}</p>
            {health?.nextService ? (
              <>
                <p className="font-heading font-extrabold text-ip-display-md text-ip-on-surface flex items-center gap-2">
                  <ClockIcon className="w-6 h-6 text-ip-primary" /> {formatDate(health.nextService.dueAt)}
                </p>
                <p className="text-sm text-ip-on-surface-variant mt-1">
                  {vehicleLabel(health.nextService.vehicleId)} — {health.nextService.description}
                </p>
              </>
            ) : (
              <p className="text-sm text-ip-on-surface-variant italic">{t('nothingScheduled')}</p>
            )}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-heading text-xl font-bold mb-4">{t('upcomingSchedule')}</h2>
        {scheduleState === 'loading' ? (
          <Skeleton className="h-48" />
        ) : openSchedules.length === 0 ? (
          <div className="ip-card">
            <EmptyState title={t('noMaintenanceScheduled')} description={t('everyUnitUpToDate')} />
          </div>
        ) : (
          <div className="ip-card">
            <Timeline events={timelineEvents} />
            <div className="mt-4 pt-4 border-t border-ip-outline/10 divide-y divide-ip-outline/10">
              {/* "Book Repair" per row, ChecklistItem-driven: cycling a row to
                  Pass books the repair as done (PATCH status:'completed');
                  Warn/Fail just acknowledge urgency without closing it out. */}
              {openSchedules.map((s) => (
                <ChecklistItem
                  key={s._id}
                  label={`${vehicleLabel(s.vehicleId)} — ${s.description}`}
                  note={s.type === 'date_triggered' ? t('dueOn', { date: formatDate(s.dueAt) }) : t('dueAtKm', { km: s.dueMileageKm ?? '?' })}
                  state={s.status === 'overdue' ? 'fail' : s.status === 'due' ? 'warn' : 'pending'}
                  onStateChange={(next) => {
                    if (next === 'pass') markCompleted(s._id);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-ip-on-surface-variant mt-6">
        {t('inspectPrompt')}{' '}
        {vehicles.length > 0 ? (
          <Link href={`/fleet-owner/vehicles/${vehicles[0]._id}/inspection`} className="text-ip-primary font-semibold hover:underline">
            {t('startInspection')}
          </Link>
        ) : (
          t('registerVehicleFirst')
        )}
      </p>

      <BottomSheet open={bookOpen} onClose={() => setBookOpen(false)} title={t('bookRepair')}>
        <form onSubmit={handleBookRepair} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">{t('vehicleFieldLabel')}</label>
            <select
              required
              value={form.vehicleId}
              onChange={(e) => setForm({ ...form, vehicleId: e.target.value })}
              className={inputClass}
            >
              <option value="" disabled>{t('selectVehicle')}</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>{v.registrationNumber}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">{t('whatNeedsDoing')}</label>
            <input
              required
              placeholder={t('descriptionPlaceholder')}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">{t('dueDate')}</label>
            <input
              required
              type="date"
              value={form.dueAt}
              onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
              className={inputClass}
            />
          </div>
          {formError && <p className="text-sm text-ip-error">{formError}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? t('booking') : t('bookRepair')}
          </Button>
        </form>
      </BottomSheet>
    </div>
  );
}
