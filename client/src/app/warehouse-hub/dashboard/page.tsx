'use client';

import { useState } from 'react';
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

function dockStatusLabel(status: DockSlotStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const GATE_EVENT_LABEL: Record<GateEventType, string> = {
  vehicle_entered: 'Vehicle entered',
  vehicle_exited: 'Vehicle exited',
  crew_signed_in: 'Crew signed in',
  crew_signed_out: 'Crew signed out',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.round(diffMs / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function WarehouseHubDashboardPage() {
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
      setFormError(err instanceof ApiClientError ? err.message : 'Could not add dock slot');
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
      setFormError(err instanceof ApiClientError ? err.message : 'Could not update dock slot');
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
            title="Couldn't load your hub"
            description={error ?? 'No warehouse hub found for this account.'}
            action={
              <Button variant="ghost" onClick={() => reload()}>
                Try again
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
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Hub console</p>
          <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{hub.name}</h1>
          {hub.address && (
            <p className="text-sm text-ip-on-surface-variant flex items-center gap-1.5">
              <MapPinIcon className="w-4 h-4" /> {hub.address}
            </p>
          )}
        </div>
        <Button variant="primary" onClick={() => { setFormError(null); setNewLabel(''); setAddSlotOpen(true); }}>
          <PlusIcon className="w-4 h-4 mr-1.5" /> Add dock slot
        </Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <MetricCard label="Total docks" value={dockSlots.length} icon={<BoxIcon className="w-5 h-5" />} />
        <MetricCard label="Occupied" value={occupiedCount} icon={<BoxIcon className="w-5 h-5" />} />
        <MetricCard
          label="On-site crew"
          value={<span className="text-base font-semibold text-ip-on-surface-variant italic">Not yet tracked</span>}
          icon={<UsersIcon className="w-5 h-5" />}
        />
      </div>

      <div className="mb-10">
        <h2 className="font-heading text-xl font-bold mb-4">Dock spaces</h2>
        {dockSlots.length === 0 ? (
          <div className="ip-card">
            <EmptyState
              icon={<BoxIcon className="w-7 h-7" />}
              title="No dock slots yet"
              description="Add your first dock slot to start tracking bay status."
              action={<Button onClick={() => setAddSlotOpen(true)}>Add dock slot</Button>}
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
        <h2 className="font-heading text-xl font-bold mb-4">Live gate feed</h2>
        <div className="ip-card">
          {gateEvents.length === 0 ? (
            <EmptyState icon={<AlertIcon className="w-7 h-7" />} title="No gate activity yet" />
          ) : (
            gateEvents.map((ev, i) => (
              <div key={ev._id}>
                <DataRow label={relativeTime(ev.createdAt)} value={GATE_EVENT_LABEL[ev.type]} />
                {i < gateEvents.length - 1 && <ListDivider />}
              </div>
            ))
          )}
        </div>
      </div>

      <BottomSheet open={addSlotOpen} onClose={() => setAddSlotOpen(false)} title="Add dock slot">
        <form onSubmit={handleAddSlot} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
              Dock label
            </label>
            <input
              required
              placeholder="e.g. Dock A3"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className={inputClass}
            />
          </div>
          {formError && <p className="text-sm text-ip-error">{formError}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Adding…' : 'Add dock slot'}
          </Button>
        </form>
      </BottomSheet>

      <BottomSheet open={!!editSlot} onClose={() => setEditSlot(null)} title={editSlot ? `Update ${editSlot.label}` : undefined}>
        {editSlot && (
          <div className="space-y-3">
            <p className="text-sm text-ip-on-surface-variant mb-2">Set the current status for this dock slot.</p>
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
