'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body, MutedText } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow } from '@/components/fy/Data';
import { Button, Chip, Field, ScrollRow } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';
import { WarehouseHubTabBar } from '@/components/fy/RoleNav';

/* Built against client/public/design/warehouse_hub_dock_slots.html.

   This screen is the Docks tab of the hub's bottom bar, which previously
   led to a 404 — the tab existed, the route did not.

   Section order in the design: the capacity ratio strip -> the "expand bay
   capacity" card with its configuration form -> the bay roster with a
   per-bay action pair -> the scheduling matrix -> the audit footer.

   Deviations, all because the data does not exist:
   - "38 Mins Running", "Discharge: 82%", "4°C", "Due in 4 Days": no bay
     records an occupancy clock, a discharge percentage or a temperature.
     A bay has a status, an optional ETA and an optional current booking.
   - The bay configuration form offers a bay class (cold chain, cross-dock,
     ground ramp), hydraulic toggles and "Register Bay with State
     Registrar". DockSlot has exactly one writable field on create — its
     label — so the form asks for that and nothing it cannot store.
   - The scheduling matrix blocks out 05:00-09:00, 09:00-14:00 and
     14:00-18:00 windows with named cargo. There is no booking-to-hub
     relation and no slot scheduling model, so no timeline can be drawn.
   - The isometric ramp render and the cryptographic audit hash are
     decorative and have nothing behind them. */

type SlotStatus = 'available' | 'occupied' | 'reserved' | 'closed';

const SLOT_STATUSES: SlotStatus[] = ['available', 'occupied', 'reserved', 'closed'];

const STATUS_TONE: Record<SlotStatus, 'lime' | 'brown' | 'slate' | 'neutral'> = {
  available: 'lime',
  occupied: 'brown',
  reserved: 'slate',
  closed: 'neutral',
};

interface BookingRef {
  _id: string;
  serviceType?: string;
  cargo?: { description?: string; weightKg?: number };
}

interface DockSlot {
  _id: string;
  label: string;
  status: SlotStatus;
  currentBookingId?: BookingRef | null;
  etaAt?: string;
  updatedAt?: string;
}

interface HubResponse {
  hub: { _id: string; name: string; totalDockSlots: number };
  dockSlots: DockSlot[];
}

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function WarehouseHubDocksPage() {
  const t = useTranslations('warehouseDashboard');
  const { data, state, error, reload } = usePolling(() => api.get<HubResponse>('/api/warehouse-hub/me'), 20000);

  const [filter, setFilter] = useState<SlotStatus | 'all'>('all');
  const [newLabel, setNewLabel] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const slots = useMemo(() => data?.dockSlots ?? [], [data]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: slots.length, available: 0, occupied: 0, reserved: 0, closed: 0 };
    for (const s of slots) c[s.status] += 1;
    return c;
  }, [slots]);

  const shown = filter === 'all' ? slots : slots.filter((s) => s.status === filter);

  async function setStatus(slot: DockSlot, status: SlotStatus) {
    setBusyId(slot._id);
    setFormError(null);
    try {
      await api.patch(`/api/warehouse-hub/dock-slots/${slot._id}`, { status });
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setBusyId(null);
    }
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setAdding(true);
    setFormError(null);
    try {
      await api.post('/api/warehouse-hub/dock-slots', { label: newLabel.trim() });
      setNewLabel('');
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorAdd'));
    } finally {
      setAdding(false);
    }
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('docksTitle')} showBack />
        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto flex flex-col gap-3">
          <div className="h-24 rounded-card bg-fy-field animate-pulse" />
          <div className="h-56 rounded-card bg-fy-field animate-pulse" />
        </main>
        <WarehouseHubTabBar />
      </div>
    );
  }

  if (state === 'error' || !data?.hub) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('docksTitle')} showBack />
        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto">
          <LightCard className="flex flex-col gap-3">
            <SectionHeading>{t('couldNotLoad')}</SectionHeading>
            <Body>{error ?? t('noHubFound')}</Body>
            <Button variant="light" className="w-full" onClick={() => reload()}>
              {t('tryAgain')}
            </Button>
          </LightCard>
        </main>
        <WarehouseHubTabBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('docksTitle')}
        showBack
        actions={<StatusPill tone="lime">{t('hubPill')}</StatusPill>}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        {formError && (
          <div role="alert" className="mt-2 rounded-card border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-body text-fy-on-error-bg">
            {formError}
          </div>
        )}

        {/* Capacity strip */}
        <div className="bg-fy-slate text-fy-on-slate rounded-sheet p-5 shadow-card flex flex-col gap-3 mt-2">
          <MetricBlock
            onDark
            tone="lime"
            label={t('capacityLabel')}
            value={`${counts.available} / ${slots.length}`}
            note={t('baysAvailableNote')}
          />
          <Divider className="border-fy-bone/15" />
          <div className="grid grid-cols-3 gap-2">
            {(['occupied', 'reserved', 'closed'] as SlotStatus[]).map((st) => (
              <div key={st} className="bg-fy-bone/10 rounded-cell p-3">
                <EyebrowLabel tone="on-dark" className="opacity-75">
                  {t(`status.${st}`)}
                </EyebrowLabel>
                <span className="font-heading text-title text-fy-bone block mt-1">{counts[st]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Add a bay — only the one field DockSlot can actually store. */}
        <Section title={<SectionHeading>{t('expandCapacity')}</SectionHeading>}>
          <LightCard>
            <form onSubmit={addSlot} className="flex flex-col gap-3">
              <MutedText>{t('expandCapacityHint')}</MutedText>
              <label className="flex flex-col gap-1">
                <EyebrowLabel>{t('dockLabel')}</EyebrowLabel>
                <Field
                  required
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={t('dockLabelPlaceholder')}
                />
              </label>
              <Button type="submit" className="w-full" glyph="add" disabled={adding}>
                {adding ? t('submitting') : t('addBay')}
              </Button>
            </form>
          </LightCard>
        </Section>

        {/* Roster */}
        <Section
          title={<SectionHeading>{t('dockSpaces')}</SectionHeading>}
          aside={<EyebrowLabel>{t('bayCount', { count: slots.length })}</EyebrowLabel>}
        >
          <ScrollRow>
            {(['all', ...SLOT_STATUSES] as (SlotStatus | 'all')[]).map((f) => (
              <Chip
                key={f}
                shape="round"
                accent={f === 'available' ? 'lime' : 'slate'}
                active={filter === f}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? t('filterAll') : t(`status.${f}`)} ({counts[f]})
              </Chip>
            ))}
          </ScrollRow>

          {shown.length === 0 ? (
            <LightCard>
              <MutedText>{slots.length === 0 ? t('noDockSlotsYetDesc') : t('noBaysInFilter')}</MutedText>
            </LightCard>
          ) : (
            <div className="flex flex-col gap-2">
              {shown.map((s, i) => (
                <Panel key={s._id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-3 min-w-0">
                      <IconTile tone={s.status === 'available' ? 'lime' : 'slate'} size="lg">
                        <span className="font-mono text-[11px] font-bold">{String(i + 1).padStart(2, '0')}</span>
                      </IconTile>
                      <span className="flex flex-col min-w-0">
                        <Body className="font-semibold truncate">{s.label}</Body>
                        <MutedText className="truncate">
                          {s.currentBookingId
                            ? s.currentBookingId.cargo?.description ||
                              t(`serviceType.${s.currentBookingId.serviceType ?? 'other'}`)
                            : t('noLoadAssigned')}
                        </MutedText>
                      </span>
                    </span>
                    <StatusPill tone={STATUS_TONE[s.status]}>{t(`status.${s.status}`)}</StatusPill>
                  </div>

                  {(s.etaAt || s.currentBookingId?.cargo?.weightKg != null) && (
                    <>
                      <Divider />
                      {s.etaAt && <StatRow label={t('etaLabel')} value={clockTime(s.etaAt)} />}
                      {s.currentBookingId?.cargo?.weightKg != null && (
                        <StatRow
                          label={t('currentLoad')}
                          value={t('cargoWeight', { kg: s.currentBookingId.cargo.weightKg })}
                        />
                      )}
                    </>
                  )}

                  <Divider />
                  <div className="flex flex-col gap-2">
                    <EyebrowLabel>{t('setStatusHint')}</EyebrowLabel>
                    <ScrollRow>
                      {SLOT_STATUSES.map((st) => (
                        <Chip
                          key={st}
                          shape="round"
                          accent={st === 'available' ? 'lime' : 'slate'}
                          active={s.status === st}
                          disabled={busyId === s._id}
                          onClick={() => setStatus(s, st)}
                        >
                          {t(`status.${st}`)}
                        </Chip>
                      ))}
                    </ScrollRow>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </Section>

        <Panel className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Icon name="verified" size={18} className="text-fy-green shrink-0" />
            <EyebrowLabel className="truncate">{data.hub.name}</EyebrowLabel>
          </span>
          <span className="font-mono text-[9px] text-fy-muted shrink-0">{data.hub._id.slice(-6).toUpperCase()}</span>
        </Panel>
      </main>

      <WarehouseHubTabBar />
    </div>
  );
}
