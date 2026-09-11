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
import { MetricBlock, StatRow, ProgressBar } from '@/components/fy/Data';
import { Button, Chip, Field, ScrollRow, SearchField } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';
import { FleetOwnerTabBar } from '@/components/fy/RoleNav';
import { FleetCorridorMap } from '@/components/fleet/FleetCorridorMap';

/* Built against client/public/design/fleet_owner_dashboard.html.

   Section order there: 64px brand bar with the FLEET pill -> "Cooperative
   Asset Registry" sub-header with the live-sync chip -> the dark dispatch
   pass-plate -> a 4-tile KPI grid -> the corridor map -> the Action
   Required feed -> the roster (search + filter chips + generous rows) ->
   the protocol footnote -> 4-tab bottom bar.

   Largest element: the KPI numerals. Dark surfaces: the pass-plate and
   the corridor map.

   Deviations, all because the data does not exist:
   - "Daily Cooperative Ton-KM 14,820", "Fleet Efficiency Yield ₹48.6/km"
     and "99.2% Uptime" have no source. The pass-plate carries the real
     fleet health figure from GET /api/fleet/health instead, which is the
     one fleet-wide number the backend actually computes.
   - Per-vehicle "Vehicle Health Index 98% Nominal" is invented. A vehicle
     has a real compliance verdict and real maintenance schedules, so each
     row states those instead of a manufactured percentage.
   - "62 km/h", "Avg Spd 54 km/h" and "Suryapet Corridor: Clear Flow": no
     speed or corridor telemetry is recorded anywhere. Vehicles do carry a
     real currentLocation, so the map plots real units at real coordinates
     and says nothing about how fast they are moving.
   - OBD-II fault codes and RTO fitness certificates have no model. The
     Action Required feed is built from the three things that are real and
     do need action: a failed compliance inspection, an overdue maintenance
     schedule, and an expiring insurance policy — plus unassigned units,
     which the design also lists and which has a real assign endpoint. */

type Filter = 'all' | 'active' | 'standby' | 'alert';

interface FleetDriverSummary {
  _id: string;
  name: string;
  phone: string;
  ratingAvg: number;
  ratingCount: number;
  accountStatus: string;
}

export interface FleetVehicleSummary {
  _id: string;
  type: string;
  capacityKg: number;
  registrationNumber: string;
  availabilityStatus: 'online' | 'offline' | 'on_job';
  verified: boolean;
  complianceStatus?: 'compliant' | 'non_compliant';
  insuranceExpiryAt?: string;
  currentLocation?: { type: 'Point'; coordinates: [number, number] };
  assignedDriverId?: FleetDriverSummary | null;
}

interface FleetDoc {
  _id: string;
  name: string;
  vehicleIds: FleetVehicleSummary[];
  driverIds: FleetDriverSummary[];
}

interface FleetHealth {
  healthPct: number;
  totalVehicles: number;
  vehiclesNeedingAttention: number;
  nextService: { _id: string; description: string; dueAt?: string; vehicleId?: { registrationNumber: string } } | null;
}

interface MaintenanceRow {
  _id: string;
  type: 'mileage_triggered' | 'date_triggered';
  description: string;
  status: 'upcoming' | 'due' | 'overdue' | 'completed';
  dueAt?: string;
  vehicleId?: { _id: string; registrationNumber: string; type: string };
}

/** Days from now until `iso`, negative once it has passed. */
function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

const INSURANCE_WARN_DAYS = 30;

export default function FleetOwnerDashboardPage() {
  const t = useTranslations('fleetDashboard');

  const { data, state, error, reload } = usePolling(() => api.get<{ fleet: FleetDoc }>('/api/fleet/me'), 20000);
  const health = usePolling(() => api.get<FleetHealth>('/api/fleet/health'), 60000);
  const maintenance = usePolling(
    () => api.get<{ schedules: MaintenanceRow[] }>('/api/fleet/maintenance'),
    60000
  );

  const fleet = data?.fleet;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const [registerOpen, setRegisterOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ vehicleType: 'mini_truck', capacityKg: '', registrationNumber: '' });
  const [assignForm, setAssignForm] = useState({ vehicleId: '', driverId: '' });

  /* A vehicle type that predates the three known options (or is added
     later server-side) must still render, so this falls back to the raw
     value rather than throwing on a missing message key. */
  const KNOWN_TYPES = ['mini_truck', 'medium_truck', 'large_truck'];
  const typeLabel = (type: string) => (KNOWN_TYPES.includes(type) ? t(`vehicleTypeOptions.${type}`) : type);

  const VEHICLE_TYPE_OPTIONS = [
    { value: 'mini_truck', label: t('vehicleTypeOptions.mini_truck') },
    { value: 'medium_truck', label: t('vehicleTypeOptions.medium_truck') },
    { value: 'large_truck', label: t('vehicleTypeOptions.large_truck') },
  ];

  const vehicles = useMemo(() => fleet?.vehicleIds ?? [], [fleet]);
  const schedules = maintenance.data?.schedules ?? [];

  /** Vehicle ids with a maintenance schedule that is due or already overdue. */
  const dueByVehicle = useMemo(() => {
    const map = new Map<string, MaintenanceRow>();
    for (const s of schedules) {
      if (s.status !== 'due' && s.status !== 'overdue') continue;
      const id = s.vehicleId?._id;
      if (!id) continue;
      // Keep the worst one per vehicle.
      const held = map.get(id);
      if (!held || (held.status === 'due' && s.status === 'overdue')) map.set(id, s);
    }
    return map;
  }, [schedules]);

  function vehicleAlert(v: FleetVehicleSummary): 'compliance' | 'maintenance' | 'insurance' | null {
    if (v.complianceStatus === 'non_compliant') return 'compliance';
    if (dueByVehicle.has(v._id)) return 'maintenance';
    const d = daysUntil(v.insuranceExpiryAt);
    if (d !== null && d <= INSURANCE_WARN_DAYS) return 'insurance';
    return null;
  }

  const counts = useMemo(() => {
    let active = 0;
    let standby = 0;
    let alert = 0;
    for (const v of vehicles) {
      if (vehicleAlert(v)) alert += 1;
      if (v.availabilityStatus === 'on_job') active += 1;
      else standby += 1;
    }
    return { all: vehicles.length, active, standby, alert };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, dueByVehicle]);

  const unassigned = vehicles.filter((v) => !v.assignedDriverId);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (q && !`${v.registrationNumber} ${v.type} ${v.assignedDriverId?.name ?? ''}`.toLowerCase().includes(q))
        return false;
      if (filter === 'active') return v.availabilityStatus === 'on_job';
      if (filter === 'standby') return v.availabilityStatus !== 'on_job';
      if (filter === 'alert') return vehicleAlert(v) !== null;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, query, filter, dueByVehicle]);

  /* The Action Required feed: only things that are real and actionable. */
  const actions = useMemo(() => {
    const rows: {
      key: string;
      kind: 'compliance' | 'maintenance' | 'insurance' | 'unassigned';
      vehicle: FleetVehicleSummary;
      detail: string;
      severity: 'critical' | 'warn' | 'neutral';
    }[] = [];
    for (const v of vehicles) {
      if (v.complianceStatus === 'non_compliant') {
        rows.push({
          key: `c-${v._id}`,
          kind: 'compliance',
          vehicle: v,
          detail: t('actionComplianceDetail'),
          severity: 'critical',
        });
      }
      const due = dueByVehicle.get(v._id);
      if (due) {
        rows.push({
          key: `m-${v._id}`,
          kind: 'maintenance',
          vehicle: v,
          detail: due.description,
          severity: due.status === 'overdue' ? 'critical' : 'warn',
        });
      }
      const d = daysUntil(v.insuranceExpiryAt);
      if (d !== null && d <= INSURANCE_WARN_DAYS) {
        rows.push({
          key: `i-${v._id}`,
          kind: 'insurance',
          vehicle: v,
          detail: d < 0 ? t('insuranceExpired') : t('insuranceDueIn', { days: d }),
          severity: d < 0 ? 'critical' : 'warn',
        });
      }
    }
    for (const v of unassigned) {
      rows.push({ key: `u-${v._id}`, kind: 'unassigned', vehicle: v, detail: t('readyForDispatch'), severity: 'neutral' });
    }
    const rank = { critical: 0, warn: 1, neutral: 2 };
    return rows.sort((a, b) => rank[a.severity] - rank[b.severity]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, dueByVehicle, unassigned, t]);

  async function handleRegisterVehicle(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/fleet/vehicles', { ...vehicleForm, capacityKg: Number(vehicleForm.capacityKg) });
      setVehicleForm({ vehicleType: 'mini_truck', capacityKg: '', registrationNumber: '' });
      setRegisterOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorRegister'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignDriver(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.post('/api/fleet/assign-driver', assignForm);
      setAssignForm({ vehicleId: '', driverId: '' });
      setAssignOpen(false);
      await reload();
    } catch (err) {
      setFormError(err instanceof ApiClientError ? err.message : t('errorAssign'));
    } finally {
      setSubmitting(false);
    }
  }

  function openAssignFor(vehicleId: string) {
    setFormError(null);
    setAssignForm({ vehicleId, driverId: '' });
    setAssignOpen(true);
  }

  const selectClass =
    'w-full min-h-[44px] px-3 rounded-cell border border-fy-hairline bg-fy-bone font-body text-body';

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('pageTitle')} />
        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto flex flex-col gap-3">
          <div className="h-32 rounded-card bg-fy-field animate-pulse" />
          <div className="grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-card bg-fy-field animate-pulse" />
            ))}
          </div>
          <div className="h-56 rounded-card bg-fy-field animate-pulse" />
        </main>
        <FleetOwnerTabBar />
      </div>
    );
  }

  if (state === 'error' || !fleet) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar eyebrow="FYRO Cooperative" title={t('pageTitle')} />
        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto">
          <LightCard className="flex flex-col gap-3">
            <SectionHeading>{t('couldNotLoad')}</SectionHeading>
            <Body>{error ?? t('noFleetFound')}</Body>
            <Button variant="light" className="w-full" onClick={() => reload()}>
              {t('tryAgain')}
            </Button>
          </LightCard>
        </main>
        <FleetOwnerTabBar />
      </div>
    );
  }

  const onJob = vehicles.filter((v) => v.availabilityStatus === 'on_job').length;
  const h = health.data;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('pageTitle')}
        actions={<StatusPill tone="lime">{t('fleetPill')}</StatusPill>}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 pt-2">
          <div className="flex flex-col min-w-0">
            <EyebrowLabel>{t('eyebrow')}</EyebrowLabel>
            <SectionHeading>{fleet.name}</SectionHeading>
          </div>
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-cell bg-fy-well shrink-0">
            <span aria-hidden className="w-2 h-2 rounded-full bg-fy-green animate-pulse" />
            <EyebrowLabel>{t('liveSync')}</EyebrowLabel>
          </span>
        </div>

        {/* Dispatch pass-plate. The design's ton-km and ₹/km yield have no
            source; fleet health and units needing attention are computed
            server-side, so those are what it carries. */}
        <div className="bg-fy-slate text-fy-on-slate rounded-sheet p-5 shadow-card flex flex-col gap-3 relative overflow-hidden">
          <span aria-hidden className="absolute -right-8 -bottom-10 w-36 h-36 rounded-full bg-fy-lime/10 blur-2xl" />
          <div className="flex items-start justify-between gap-3 relative z-10">
            <div className="min-w-0">
              <EyebrowLabel tone="on-dark" className="opacity-75">
                {t('dispatchMaster')}
              </EyebrowLabel>
              <p className="font-heading text-title text-fy-bone mt-0.5 truncate">{t('regionalLine')}</p>
            </div>
            <StatusPill tone="lime">{t('healthPct', { pct: h?.healthPct ?? 100 })}</StatusPill>
          </div>
          <div className="grid grid-cols-2 gap-3 relative z-10">
            <div className="bg-fy-bone/10 rounded-cell p-3">
              <EyebrowLabel tone="on-dark" className="opacity-75">
                {t('unitsMonitored')}
              </EyebrowLabel>
              <span className="font-heading text-title text-fy-bone block mt-1">{h?.totalVehicles ?? vehicles.length}</span>
            </div>
            <div className="bg-fy-bone/10 rounded-cell p-3">
              <EyebrowLabel tone="on-dark" className="opacity-75">
                {t('needingAttention')}
              </EyebrowLabel>
              <span
                className={`font-heading text-title block mt-1 ${
                  (h?.vehiclesNeedingAttention ?? 0) > 0 ? 'text-fy-lime' : 'text-fy-bone'
                }`}
              >
                {h?.vehiclesNeedingAttention ?? 0}
              </span>
            </div>
          </div>
          {h?.nextService && (
            <>
              <Divider className="border-fy-bone/15" />
              <StatRow
                className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-bone relative z-10"
                label={t('nextService')}
                value={`${h.nextService.vehicleId?.registrationNumber ?? '—'} · ${h.nextService.description}`}
              />
            </>
          )}
        </div>

        {/* KPI grid */}
        <div className="grid grid-cols-2 gap-3">
          <LightCard>
            <MetricBlock
              label={t('totalVehicles')}
              value={vehicles.length}
              note={t('registeredCarriers')}
              aside={<Icon name="local_shipping" size={20} className="text-fy-slate" />}
            />
          </LightCard>
          <LightCard>
            <MetricBlock
              label={t('activeDrivers')}
              value={fleet.driverIds.length}
              note={t('onRoster')}
              aside={<Icon name="badge" size={20} className="text-fy-slate" />}
            />
          </LightCard>
          <LightCard>
            <MetricBlock label={t('onJob')} value={onJob} tone="green" note={t('transitActive')} />
          </LightCard>
          <LightCard>
            <MetricBlock
              label={t('unassignedUnits')}
              value={unassigned.length}
              tone={unassigned.length > 0 ? 'brown' : 'ink'}
              note={t('availableAtDepots')}
            />
          </LightCard>
        </div>

        {/* Corridor map — real coordinates only. */}
        <FleetCorridorMap vehicles={vehicles} alertFor={vehicleAlert} />

        {/* Action Required */}
        <Section
          title={
            <span className="flex items-center gap-2">
              <Icon name="notification_important" size={20} className="text-fy-brown" />
              <SectionHeading>{t('actionRequired')}</SectionHeading>
            </span>
          }
          aside={
            actions.length > 0 ? (
              <StatusPill tone="brown">{t('activeIssues', { count: actions.length })}</StatusPill>
            ) : undefined
          }
        >
          {actions.length === 0 ? (
            <LightCard>
              <MutedText>{t('noActionsNeeded')}</MutedText>
            </LightCard>
          ) : (
            <div className="flex flex-col gap-2">
              {actions.map((a) => (
                <Panel key={a.key} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex items-center gap-2 min-w-0">
                      <StatusPill tone={a.severity === 'critical' ? 'critical' : a.severity === 'warn' ? 'brown' : 'neutral'}>
                        {t(`actionKind.${a.kind}`)}
                      </StatusPill>
                      <Body className="font-semibold truncate">{a.vehicle.registrationNumber}</Body>
                    </span>
                    {a.kind === 'unassigned' && (
                      <Button size="md" variant="green" onClick={() => openAssignFor(a.vehicle._id)}>
                        {t('assignDriver')}
                      </Button>
                    )}
                  </div>
                  <MutedText>{a.detail}</MutedText>
                </Panel>
              ))}
            </div>
          )}
        </Section>

        {/* Roster */}
        <Section
          title={<SectionHeading>{t('fleetRoster')}</SectionHeading>}
          aside={<EyebrowLabel>{t('unitsMonitoredCount', { count: vehicles.length })}</EyebrowLabel>}
        >
          <SearchField value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('searchPlaceholder')} />

          <ScrollRow>
            {(['all', 'active', 'standby', 'alert'] as Filter[]).map((f) => (
              <Chip
                key={f}
                shape="round"
                accent={f === 'alert' ? 'brown' : 'slate'}
                active={filter === f}
                onClick={() => setFilter(f)}
              >
                {t(`filters.${f}`)} ({counts[f]})
              </Chip>
            ))}
          </ScrollRow>

          {roster.length === 0 ? (
            <LightCard>
              <MutedText>{vehicles.length === 0 ? t('noVehiclesYetDesc') : t('noMatches')}</MutedText>
            </LightCard>
          ) : (
            <div className="flex flex-col gap-2">
              {roster.map((v, i) => {
                const alert = vehicleAlert(v);
                const due = dueByVehicle.get(v._id);
                return (
                  <Panel key={v._id} className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-3 min-w-0">
                        <IconTile tone={alert ? 'peach' : 'slate-pale'} size="lg">
                          <span className="font-mono text-[11px] font-bold">{String(i + 1).padStart(2, '0')}</span>
                        </IconTile>
                        <span className="flex flex-col min-w-0">
                          <Body className="font-semibold truncate">{v.registrationNumber}</Body>
                          <EyebrowLabel>{typeLabel(v.type)}</EyebrowLabel>
                        </span>
                      </span>
                      <StatusPill tone={v.availabilityStatus === 'on_job' ? 'lime' : 'neutral'}>
                        {t(v.availabilityStatus === 'on_job' ? 'onJob' : v.availabilityStatus === 'online' ? 'online' : 'offline')}
                      </StatusPill>
                    </div>

                    <Divider />

                    <div className="flex items-center justify-between gap-3">
                      {v.assignedDriverId ? (
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon name="person" size={16} className="text-fy-slate shrink-0" />
                          <MutedText className="truncate">{v.assignedDriverId.name}</MutedText>
                        </span>
                      ) : (
                        <span className="flex items-center gap-2 min-w-0">
                          <Icon name="person_off" size={16} className="text-fy-brown shrink-0" />
                          <EyebrowLabel tone="brown">{t('unassigned')}</EyebrowLabel>
                        </span>
                      )}
                      {!v.assignedDriverId && (
                        <button
                          type="button"
                          onClick={() => openAssignFor(v._id)}
                          className="font-mono text-[10px] uppercase tracking-wider text-fy-brown font-bold shrink-0"
                        >
                          {t('assignDriver')}
                        </button>
                      )}
                    </div>

                    {/* The design's invented health percentage, replaced by
                        the real compliance and maintenance state. */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <EyebrowLabel>{t('unitCondition')}</EyebrowLabel>
                        <EyebrowLabel tone={alert ? 'brown' : 'green'}>
                          {alert === 'compliance'
                            ? t('conditionNonCompliant')
                            : alert === 'maintenance'
                              ? t('conditionServiceDue', { status: t(`maintenanceStatus.${due?.status ?? 'due'}`) })
                              : alert === 'insurance'
                                ? t('conditionInsurance')
                                : v.verified
                                  ? t('conditionVerified')
                                  : t('conditionUnverified')}
                        </EyebrowLabel>
                      </div>
                      <ProgressBar value={alert ? 34 : v.verified ? 100 : 68} tone={alert ? 'error' : 'green'} />
                    </div>
                  </Panel>
                );
              })}
            </div>
          )}
        </Section>

        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="light"
            className="w-full"
            glyph="add"
            onClick={() => {
              setFormError(null);
              setRegisterOpen(true);
            }}
          >
            {t('registerVehicle')}
          </Button>
          <Button
            className="w-full"
            glyph="person_add"
            onClick={() => {
              setFormError(null);
              setAssignForm({ vehicleId: '', driverId: '' });
              setAssignOpen(true);
            }}
          >
            {t('assignDriver')}
          </Button>
        </div>

        <Panel className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0">
            <Icon name="verified" size={18} className="text-fy-green shrink-0" />
            <EyebrowLabel className="truncate">{t('protocolStamp')}</EyebrowLabel>
          </span>
          <span className="font-mono text-[9px] text-fy-muted shrink-0">{fleet._id.slice(-6).toUpperCase()}</span>
        </Panel>
      </main>

      <BottomSheet open={registerOpen} onClose={() => setRegisterOpen(false)} title={t('registerVehicle')}>
        <form onSubmit={handleRegisterVehicle} className="flex flex-col gap-3">
          {formError && (
            <div role="alert" className="rounded-card border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-body text-fy-on-error-bg">
              {formError}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('vehicleType')}</EyebrowLabel>
            <select
              value={vehicleForm.vehicleType}
              onChange={(e) => setVehicleForm((f) => ({ ...f, vehicleType: e.target.value }))}
              className={selectClass}
            >
              {VEHICLE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('capacityKg')}</EyebrowLabel>
            <Field
              type="number"
              min={1}
              required
              value={vehicleForm.capacityKg}
              onChange={(e) => setVehicleForm((f) => ({ ...f, capacityKg: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('registrationNumber')}</EyebrowLabel>
            <Field
              required
              value={vehicleForm.registrationNumber}
              onChange={(e) => setVehicleForm((f) => ({ ...f, registrationNumber: e.target.value }))}
              placeholder="AP-16-TX-1024"
            />
          </label>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? t('submitting') : t('registerVehicle')}
          </Button>
        </form>
      </BottomSheet>

      <BottomSheet open={assignOpen} onClose={() => setAssignOpen(false)} title={t('assignDriver')}>
        <form onSubmit={handleAssignDriver} className="flex flex-col gap-3">
          {formError && (
            <div role="alert" className="rounded-card border border-fy-error/25 bg-fy-error-bg px-4 py-3 text-body text-fy-on-error-bg">
              {formError}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('vehicle')}</EyebrowLabel>
            <select
              required
              value={assignForm.vehicleId}
              onChange={(e) => setAssignForm((f) => ({ ...f, vehicleId: e.target.value }))}
              className={selectClass}
            >
              <option value="">{t('selectVehicle')}</option>
              {vehicles.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.registrationNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <EyebrowLabel>{t('driver')}</EyebrowLabel>
            <select
              required
              value={assignForm.driverId}
              onChange={(e) => setAssignForm((f) => ({ ...f, driverId: e.target.value }))}
              className={selectClass}
            >
              <option value="">{t('selectDriver')}</option>
              {fleet.driverIds.map((d) => (
                <option key={d._id} value={d._id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {fleet.driverIds.length === 0 && <MutedText>{t('noDriversYet')}</MutedText>}
          <Button type="submit" className="w-full" disabled={submitting || fleet.driverIds.length === 0}>
            {submitting ? t('submitting') : t('assignDriver')}
          </Button>
        </form>
      </BottomSheet>

      <FleetOwnerTabBar />
    </div>
  );
}
