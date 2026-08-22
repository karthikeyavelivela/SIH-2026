'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MetricCard } from '@/components/ui/MetricCard';
import { StatusChip } from '@/components/ui/StatusChip';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataRow } from '@/components/ui/DataRow';
import { ListDivider } from '@/components/ui/ListDivider';
import { BoxIcon, UsersIcon, AlertIcon, PlusIcon, MapPinIcon } from '@/components/ui/icons';

type DockSlotStatus = 'available' | 'occupied' | 'reserved' | 'closed';
type GateEventType = 'vehicle_entered' | 'vehicle_exited' | 'crew_signed_in' | 'crew_signed_out';

interface DockSlotDoc {
  _id: string;
  label: string;
  status: DockSlotStatus;
  etaAt?: string;
}

interface GateEventDoc {
  _id: string;
  type: GateEventType;
  note?: string;
  createdAt: string;
}

interface HubDoc {
  _id: string;
  name: string;
  address: string;
  totalDockSlots: number;
}

interface HubResponse {
  hub: HubDoc;
  dockSlots: DockSlotDoc[];
  gateEvents: GateEventDoc[];
}

const DOCK_STATUS_OPTIONS: DockSlotStatus[] = ['available', 'occupied', 'reserved', 'closed'];

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

function dockStatusTone(status: DockSlotStatus): 'success' | 'primary' | 'warning' | 'muted' {
  if (status === 'available') return 'success';
  if (status === 'occupied') return 'primary';
  if (status === 'reserved') return 'warning';
  return 'muted';
}

export default function WarehouseHubDashboardPage() {
  const t = useTranslations('warehouseDashboard');
  function dockStatusLabel(status: DockSlotStatus): string {
    return t(`status.${status}`);
  }
  function relativeTime(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.max(0, Math.round(diffMs / 60000));
    if (mins < 1) return t('justNow');
    if (mins < 60) return mins === 1 ? t('minAgo', { count: mins }) : t('minsAgo', { count: mins });
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs === 1 ? t('hrAgo', { count: hrs }) : t('hrsAgo', { count: hrs });
    const days = Math.round(hrs / 24);
    return days === 1 ? t('dayAgo', { count: days }) : t('daysAgo', { count: days });
  }
  const { data, state, error, reload } = usePolling(() => api.get<HubResponse>('/api/warehouse-hub/me'), 15000);
  const hub = data?.hub;
  const dockSlots = data?.dockSlots ?? [];
  const gateEvents = data?.gateEvents ?? [];

  const [addSlotOpen, setAddSlotOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<DockSlotDoc | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleAddSlot(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/warehouse-hub/dock-slots', { label: newLabel });
      setNewLabel('');
      setAddSlotOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorAdd'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(status: DockSlotStatus) {
    if (!editSlot) return;
    setFormError(null);
    setSubmitting(true);
    try {
      await api.patch(`/api/warehouse-hub/dock-slots/${editSlot._id}`, { status });
      setEditSlot(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="max-w-6xl mx-auto">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-96 mb-8" />
        <div className="grid sm:grid-cols-3 gap-4 mb-10">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (state === 'error' || !hub) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="ip-card">
          <EmptyState
            icon={<AlertIcon className="w-7 h-7" />}
            title={t('couldNotLoad')}
            description={error ?? t('noHubFound')}
            action={
              <Button variant="ghost" onClick={() => reload()}>
                {t('tryAgain')}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const occupiedCount = dockSlots.filter((d) => d.status === 'occupied').length;

  return (
    <div className="max-w-6xl mx-auto animate-[fadeUp_400ms_ease-out]">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
          <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{hub.name}</h1>
          {hub.address && (
            <p className="text-sm text-ip-on-surface-variant flex items-center gap-1.5">
              <MapPinIcon className="w-4 h-4" /> {hub.address}
            </p>
          )}
        </div>
        <Button variant="primary" onClick={() => { setFormError(null); setNewLabel(''); setAddSlotOpen(true); }}>
          <PlusIcon className="w-4 h-4 mr-1.5" /> {t('addDockSlot')}
        </Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <MetricCard label={t('totalDocks')} value={dockSlots.length} icon={<BoxIcon className="w-5 h-5" />} />
        <MetricCard label={t('occupied')} value={occupiedCount} icon={<BoxIcon className="w-5 h-5" />} />
        <MetricCard
          label={t('onSiteCrew')}
          value={<span className="text-base font-semibold text-ip-on-surface-variant italic">{t('notYetTracked')}</span>}
          icon={<UsersIcon className="w-5 h-5" />}
        />
      </div>

      <div className="mb-10">
        <h2 className="font-heading text-xl font-bold mb-4">{t('dockSpaces')}</h2>
        {dockSlots.length === 0 ? (
          <div className="ip-card">
            <EmptyState
              icon={<BoxIcon className="w-7 h-7" />}
              title={t('noDockSlotsYet')}
              description={t('noDockSlotsYetDesc')}
              action={<Button onClick={() => setAddSlotOpen(true)}>{t('addDockSlot')}</Button>}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {dockSlots.map((slot) => (
              <button
                key={slot._id}
                type="button"
                onClick={() => { setFormError(null); setEditSlot(slot); }}
                className="ip-card text-left hover:bg-ip-surface-container-high transition-colors"
              >
                <p className="font-heading font-bold text-lg mb-2">{slot.label}</p>
                <StatusChip tone={dockStatusTone(slot.status)} dot>
                  {dockStatusLabel(slot.status)}
                </StatusChip>
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-heading text-xl font-bold mb-4">{t('liveGateFeed')}</h2>
        <div className="ip-card">
          {gateEvents.length === 0 ? (
            <EmptyState icon={<AlertIcon className="w-7 h-7" />} title={t('noGateActivity')} />
          ) : (
            gateEvents.map((ev, i) => (
              <div key={ev._id}>
                <DataRow label={relativeTime(ev.createdAt)} value={t(`gateEvent.${ev.type}`)} />
                {i < gateEvents.length - 1 && <ListDivider />}
              </div>
            ))
          )}
        </div>
      </div>

      <BottomSheet open={addSlotOpen} onClose={() => setAddSlotOpen(false)} title={t('addDockSlot')}>
        <form onSubmit={handleAddSlot} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              {t('dockLabel')}
            </label>
            <input
              required
              placeholder={t('dockLabelPlaceholder')}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={inputClass}
            />
          </div>
          {formError && <p className="text-sm text-ip-error">{formError}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? t('adding') : t('addDockSlot')}
          </Button>
        </form>
      </BottomSheet>

      <BottomSheet open={!!editSlot} onClose={() => setEditSlot(null)} title={editSlot ? t('updateSlot', { label: editSlot.label }) : undefined}>
        {editSlot && (
          <div className="space-y-3">
            <p className="text-sm text-ip-on-surface-variant mb-2">{t('setStatusHint')}</p>
            <div className="grid grid-cols-2 gap-2.5">
              {DOCK_STATUS_OPTIONS.map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleStatusChange(status)}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-ip-input border text-sm font-semibold transition-colors disabled:opacity-50 ${
                    editSlot.status === status
                      ? 'border-ip-primary bg-ip-primary-container/20 text-ip-primary'
                      : 'border-ip-outline/20 hover:bg-ip-surface-container'
                  }`}
                >
                  {dockStatusLabel(status)}
                </button>
              ))}
            </div>
            {formError && <p className="text-sm text-ip-error">{formError}</p>}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
