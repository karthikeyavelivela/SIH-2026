'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body, MutedText } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow } from '@/components/fy/Data';
import { Button, Chip, Field, ScrollRow } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';
import { WarehouseHubTabBar } from '@/components/fy/RoleNav';

/* Built against client/public/design/warehouse_hub_dashboard.html.

   Section order there: 64px brand bar with the HUB pill -> the dark
   cooperative status banner -> a 4-tile KPI grid -> the facility layout
   plate -> the dock bays grid -> the live gate event feed -> the inbound
   consignment queue -> 3-tab bottom bar.

   Largest element: the KPI numerals. Dark surface: the status banner.

   Deviations, all because the data does not exist:
   - "Avg Turnaround 42m / 8m vs target": nothing records when a vehicle
     entered versus left, so no turnaround can be computed. The fourth tile
     counts today's real gate movements instead.
   - The isometric facility render and "Apron Live View" are decorative;
     there is no floor plan, no bay geometry and no camera. The bays grid
     below it already shows every bay's real state, so the render is not
     reproduced rather than faked with a stock photo of someone else's
     warehouse.
   - "Inbound Loads Ledger" lists expected arrivals with ETA and tonnage.
     Nothing links a Booking to a destination hub — DockSlot.currentBookingId
     is the only booking relation that exists — so there is no set of
     "loads inbound to this hub" to list. The section is omitted; when that
     relation is added, this is where it goes.
   - Weighbridge readings, cargo tonnage per bay and gang names have no
     model. A bay names the real booking it holds, and nothing more.

   Everything else is real: dock slots and their statuses come from
   GET /api/warehouse-hub/me, and so does the gate event log. Crews and
   vehicles on site are derived from that log by pairing each sign-in with
   its sign-out. */

type SlotStatus = 'available' | 'occupied' | 'reserved' | 'closed';

const SLOT_STATUSES: SlotStatus[] = ['available', 'occupied', 'reserved', 'closed'];

interface BookingRef {
  _id: string;
  serviceType?: string;
  status?: string;
  cargo?: { description?: string; weightKg?: number };
  scheduledFor?: string;
}

interface DockSlot {
  _id: string;
  label: string;
  status: SlotStatus;
  currentBookingId?: BookingRef | null;
  etaAt?: string;
}

interface GateEvent {
  _id: string;
  type: 'vehicle_entered' | 'vehicle_exited' | 'crew_signed_in' | 'crew_signed_out';
  note?: string;
  createdAt: string;
  vehicleId?: { _id: string; registrationNumber: string; type: string } | null;
  userId?: { _id: string; name: string; role: string } | null;
  bookingId?: BookingRef | null;
}

interface Hub {
  _id: string;
  name: string;
  address: string;
  totalDockSlots: number;
  operatingHours?: string;
  gateContacts: { name: string; phone: string }[];
}

interface HubResponse {
  hub: Hub;
  dockSlots: DockSlot[];
  gateEvents: GateEvent[];
}

const EVENT_GLYPH: Record<GateEvent['type'], string> = {
  vehicle_entered: 'login',
  vehicle_exited: 'logout',
  crew_signed_in: 'groups',
  crew_signed_out: 'group_remove',
};

const STATUS_TONE: Record<SlotStatus, 'lime' | 'brown' | 'slate' | 'neutral'> = {
  available: 'lime',
  occupied: 'brown',
  reserved: 'slate',
  closed: 'neutral',
};

function clockTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function WarehouseHubDashboardPage() {
  const t = useTranslations('warehouseDashboard');
  const { data, state, error, reload } = usePolling(() => api.get<HubResponse>('/api/warehouse-hub/me'), 20000);

  const [sheetSlot, setSheetSlot] = useState<DockSlot | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const hub = data?.hub;
  const slots = useMemo(() => data?.dockSlots ?? [], [data]);
  const events = useMemo(() => data?.gateEvents ?? [], [data]);

  const freeSlots = slots.filter((s) => s.status === 'available');

  /* On-site counts, paired from the real log: the newest event per subject
     decides whether they are still inside. Events arrive newest-first. */
  const onSite = useMemo(() => {
    const seenCrew = new Set<string>();
    const seenVehicle = new Set<string>();
    let crew = 0;
    let vehicles = 0;
    for (const e of events) {
      if (e.type === 'crew_signed_in' || e.type === 'crew_signed_out') {
        const id = e.userId?._id;
        if (!id || seenCrew.has(id)) continue;
        seenCrew.add(id);
        if (e.type === 'crew_signed_in') crew += 1;
      } else {
        const id = e.vehicleId?._id;
        if (!id || seenVehicle.has(id)) continue;
        seenVehicle.add(id);
        if (e.type === 'vehicle_entered') vehicles += 1;
      }
    }
    return { crew, vehicles };
  }, [events]);

  const movementsToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return events.filter((e) => new Date(e.createdAt).getTime() >= start.getTime()).length;
  }, [events]);

  async function setSlotStatus(slot: DockSlot, status: SlotStatus) {
    setBusy(true);
    setFormError(null);
    try {
      await api.patch(`/api/warehouse-hub/dock-slots/${slot._id}`, { status });
      setSheetSlot(null);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setBusy(false);
    }
  }

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setBusy(true);
    setFormError(null);
    try {
      await api.post('/api/warehouse-hub/dock-slots', { label: newLabel.trim() });
      setNewLabel('');
      setAddOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorAdd'));
    } finally {
      setBusy(false);
    }
  }

  function eventTitle(e: GateEvent): string {
    if (e.type === 'vehicle_entered' || e.type === 'vehicle_exited') {
      const reg = e.vehicleId?.registrationNumber;
      return reg ? t(`eventWithVehicle.${e.type}`, { reg }) : t(`gateEvent.${e.type}`);
    }
    const name = e.userId?.name;
    return name ? t(`eventWithPerson.${e.type}`, { name }) : t(`gateEvent.${e.type}`);
  }

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('pageTitle')} />
        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto flex flex-col gap-3">
          <div className="h-24 rounded-card bg-fy-field animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-card bg-fy-field animate-pulse" />
            ))}
          </div>
          <div className="h-56 rounded-card bg-fy-field animate-pulse" />
        </main>
        <WarehouseHubTabBar />
      </div>
    );
  }

  if (state === 'error' || !hub) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('pageTitle')} />
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
        title={t('pageTitle')}
        actions={<StatusPill tone="lime">{t('hubPill')}</StatusPill>}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        {/* Status banner */}
        <div className="bg-fy-slate text-fy-on-slate rounded-sheet p-4 shadow-card flex items-center justify-between gap-3 mt-2">
          <span className="flex items-center gap-3 min-w-0">
            <Icon name="verified_user" size={20} className="text-fy-lime shrink-0" />
            <span className="flex flex-col min-w-0">
              <EyebrowLabel tone="on-dark" className="opacity-75">
                {hub.address || t('cooperativeTerminal')}
              </EyebrowLabel>
              <p className="font-heading text-title text-fy-bone truncate">{hub.name}</p>
            </span>
          </span>
          <StatusPill tone="lime" dot>
            {t('liveSync')}
          </StatusPill>
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <LightCard>
            <MetricBlock
              label={t('docksFree')}
              value={`${freeSlots.length} / ${slots.length || hub.totalDockSlots}`}
              note={
                freeSlots.length > 0
                  ? t('baysReady', { labels: freeSlots.slice(0, 2).map((s) => s.label).join(', ') })
                  : t('noBaysFree')
              }
              aside={<Icon name="dock" size={20} className="text-fy-slate" />}
            />
          </LightCard>
          <LightCard>
            <MetricBlock
              label={t('crewsOnSite')}
              value={onSite.crew}
              note={t('signedInNow')}
              aside={<Icon name="groups" size={20} className="text-fy-slate" />}
            />
          </LightCard>
          <LightCard>
            <MetricBlock
              label={t('vehiclesOnSite')}
              value={onSite.vehicles}
              tone="green"
              note={t('insideGate')}
              aside={<Icon name="local_shipping" size={20} className="text-fy-slate" />}
            />
          </LightCard>
          <LightCard>
            <MetricBlock
              label={t('movementsToday')}
              value={movementsToday}
              note={t('gateEventsLogged')}
              aside={<Icon name="schedule" size={20} className="text-fy-slate" />}
            />
          </LightCard>
        </div>

        {/* Dock bays */}
        <Section
          title={<SectionHeading>{t('dockSpaces')}</SectionHeading>}
          aside={<EyebrowLabel>{t('tapToAllocate')}</EyebrowLabel>}
        >
          {slots.length === 0 ? (
            <LightCard className="flex flex-col gap-3">
              <MutedText>{t('noDockSlotsYetDesc')}</MutedText>
              <Button className="w-full" glyph="add" onClick={() => setAddOpen(true)}>
                {t('addBay')}
              </Button>
            </LightCard>
          ) : (
            <div className="flex flex-col gap-2">
              {slots.map((s, i) => (
                <button
                  key={s._id}
                  type="button"
                  onClick={() => {
                    setFormError(null);
                    setSheetSlot(s);
                  }}
                  className="text-left bg-fy-card rounded-card p-4 shadow-card flex items-start justify-between gap-3 hover:shadow-float transition-shadow"
                >
                  <span className="flex items-start gap-3 min-w-0">
                    <IconTile tone={s.status === 'available' ? 'lime' : 'slate'} size="lg">
                      <span className="font-mono text-[11px] font-bold">{String(i + 1).padStart(2, '0')}</span>
                    </IconTile>
                    <span className="flex flex-col min-w-0">
                      <Body className="font-semibold truncate">{s.label}</Body>
                      <MutedText className="truncate">
                        {s.currentBookingId
                          ? s.currentBookingId.cargo?.description || t(`serviceType.${s.currentBookingId.serviceType ?? 'other'}`)
                          : t('noLoadAssigned')}
                      </MutedText>
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <StatusPill tone={STATUS_TONE[s.status]}>{t(`status.${s.status}`)}</StatusPill>
                    {s.etaAt && <EyebrowLabel>{t('etaAt', { time: clockTime(s.etaAt) })}</EyebrowLabel>}
                  </span>
                </button>
              ))}
              <Button variant="light" className="w-full" glyph="add" onClick={() => setAddOpen(true)}>
                {t('addBay')}
              </Button>
            </div>
          )}
        </Section>

        {/* Gate feed */}
        <Section
          title={
            <span className="flex items-center gap-2">
              <Icon name="sensors" size={20} className="text-fy-slate" />
              <SectionHeading>{t('liveGateFeed')}</SectionHeading>
            </span>
          }
          aside={<EyebrowLabel>{t('realtimeLog')}</EyebrowLabel>}
        >
          <LightCard className="flex flex-col gap-3">
            {events.length === 0 ? (
              <MutedText>{t('noGateActivity')}</MutedText>
            ) : (
              events.map((e) => (
                <div key={e._id} className="flex items-start gap-3">
                  <IconTile
                    tone={e.type === 'vehicle_entered' || e.type === 'crew_signed_in' ? 'lime' : 'slate-pale'}
                    size="sm"
                  >
                    <Icon name={EVENT_GLYPH[e.type]} size={16} />
                  </IconTile>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <Body className="font-semibold truncate">{eventTitle(e)}</Body>
                      <EyebrowLabel className="shrink-0">{clockTime(e.createdAt)}</EyebrowLabel>
                    </div>
                    {(e.note || e.bookingId?.cargo?.description) && (
                      <MutedText className="block truncate">{e.note || e.bookingId?.cargo?.description}</MutedText>
                    )}
                  </div>
                </div>
              ))
            )}
          </LightCard>
        </Section>

        <Panel className="flex flex-col gap-2">
          <EyebrowLabel>{t('facilityDetails')}</EyebrowLabel>
          <StatRow label={t('operatingHours')} value={hub.operatingHours || t('notSet')} />
          <StatRow label={t('totalBays')} value={String(slots.length || hub.totalDockSlots)} />
          {hub.gateContacts.length > 0 && (
            <>
              <Divider />
              {hub.gateContacts.map((c, i) => (
                <StatRow key={i} label={c.name} value={c.phone} />
              ))}
            </>
          )}
        </Panel>
      </main>

      {/* Bay allocation sheet */}
      <BottomSheet open={!!sheetSlot} onClose={() => setSheetSlot(null)} title={sheetSlot?.label ?? ''}>
        <div className="flex flex-col gap-3">
          {formError && (
            <div role="alert" className="rounded-card border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-body text-fy-on-error-bg">
              {formError}
            </div>
          )}
          <MutedText>{t('setStatusHint')}</MutedText>
          <ScrollRow>
            {SLOT_STATUSES.map((st) => (
              <Chip
                key={st}
                shape="round"
                accent={st === 'available' ? 'lime' : 'slate'}
                active={sheetSlot?.status === st}
                disabled={busy}
                onClick={() => sheetSlot && setSlotStatus(sheetSlot, st)}
              >
                {t(`status.${st}`)}
              </Chip>
            ))}
          </ScrollRow>
          {sheetSlot?.currentBookingId && (
            <Panel className="flex flex-col gap-1">
              <EyebrowLabel>{t('currentLoad')}</EyebrowLabel>
              <Body className="font-semibold">
                {sheetSlot.currentBookingId.cargo?.description ??
                  t(`serviceType.${sheetSlot.currentBookingId.serviceType ?? 'other'}`)}
              </Body>
              {sheetSlot.currentBookingId.cargo?.weightKg != null && (
                <MutedText>{t('cargoWeight', { kg: sheetSlot.currentBookingId.cargo.weightKg })}</MutedText>
              )}
            </Panel>
          )}
        </div>
      </BottomSheet>

      {/* Add bay sheet */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title={t('addBay')}>
        <form onSubmit={addSlot} className="flex flex-col gap-3">
          {formError && (
            <div role="alert" className="rounded-card border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-body text-fy-on-error-bg">
              {formError}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('dockLabel')}</EyebrowLabel>
            <Field required value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={t('dockLabelPlaceholder')} />
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? t('submitting') : t('addBay')}
          </Button>
        </form>
      </BottomSheet>

      <WarehouseHubTabBar />
    </div>
  );
}
