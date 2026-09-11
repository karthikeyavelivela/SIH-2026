'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { EyebrowLabel, MutedText } from '@/components/fy/Text';
import type { FleetVehicleSummary } from '@/app/fleet-owner/dashboard/page';

/**
 * The corridor plate from fleet_owner_dashboard.html.
 *
 * The design draws a stylised Telangana/AP highway spine with NH65 and NH44
 * labelled and four pins at hand-placed percentages. The pins here are the
 * fleet's real vehicles at their real `currentLocation`, projected into the
 * plate by normalising against the bounding box of the units actually being
 * shown — so the picture is a true relative arrangement of the fleet rather
 * than a decorative map of a state.
 *
 * What the design shows that this does not: road names, corridor flow
 * ("Clear Flow"), and per-unit speed. None of that is recorded anywhere, and
 * a drawn highway under real pins would imply the units are on that road.
 * The grid and scale bar say plainly that this is a relative plot.
 */

const PAD = 0.12; // keep pins off the plate's edges

export function FleetCorridorMap({
  vehicles,
  alertFor,
}: {
  vehicles: FleetVehicleSummary[];
  alertFor: (v: FleetVehicleSummary) => 'compliance' | 'maintenance' | 'insurance' | null;
}) {
  const t = useTranslations('fleetDashboard');

  const located = useMemo(
    () =>
      vehicles.filter(
        (v) =>
          Array.isArray(v.currentLocation?.coordinates) &&
          Number.isFinite(v.currentLocation!.coordinates[0]) &&
          Number.isFinite(v.currentLocation!.coordinates[1]) &&
          // [0,0] is the model default for a unit that has never reported.
          !(v.currentLocation!.coordinates[0] === 0 && v.currentLocation!.coordinates[1] === 0)
      ),
    [vehicles]
  );

  const pins = useMemo(() => {
    if (located.length === 0) return [];
    const lngs = located.map((v) => v.currentLocation!.coordinates[0]);
    const lats = located.map((v) => v.currentLocation!.coordinates[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    // A single unit, or several at one point, sits dead centre.
    const spanLng = maxLng - minLng || 1;
    const spanLat = maxLat - minLat || 1;

    return located.map((v, i) => {
      const [lng, lat] = v.currentLocation!.coordinates;
      const x = located.length === 1 ? 50 : (PAD + ((lng - minLng) / spanLng) * (1 - 2 * PAD)) * 100;
      // Latitude increases northward, which is up the plate.
      const y = located.length === 1 ? 50 : (PAD + (1 - (lat - minLat) / spanLat) * (1 - 2 * PAD)) * 100;
      const alert = alertFor(v);
      const tone = alert
        ? 'bg-fy-error text-fy-on-error'
        : v.availabilityStatus === 'on_job'
          ? 'bg-fy-lime text-fy-on-lime'
          : 'bg-fy-bone text-fy-ink';
      return { v, x, y, tone, label: String(i + 1).padStart(2, '0') };
    });
  }, [located, alertFor]);

  /** Rough east–west extent of the plot, so the scale line means something. */
  const spanKm = useMemo(() => {
    if (located.length < 2) return null;
    const lngs = located.map((v) => v.currentLocation!.coordinates[0]);
    const lats = located.map((v) => v.currentLocation!.coordinates[1]);
    const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const km = (Math.max(...lngs) - Math.min(...lngs)) * 111 * Math.cos((midLat * Math.PI) / 180);
    return Math.max(1, Math.round(km));
  }, [located]);

  return (
    <div className="bg-fy-slate text-fy-on-slate rounded-card p-4 shadow-card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <EyebrowLabel tone="on-dark" className="opacity-75">
            {t('telemetryEyebrow')}
          </EyebrowLabel>
          <p className="font-heading text-title text-fy-bone mt-0.5">{t('telemetryTitle')}</p>
        </div>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-fy-bone/15 shrink-0">
          <span aria-hidden className={`w-2 h-2 rounded-full ${located.length > 0 ? 'bg-fy-lime' : 'bg-fy-bone/40'}`} />
          <EyebrowLabel tone="on-dark">
            {located.length > 0 ? t('unitsPlotted', { count: located.length }) : t('noPositions')}
          </EyebrowLabel>
        </span>
      </div>

      <div className="relative w-full h-48 rounded-cell bg-fy-bone/10 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(253,249,240,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(253,249,240,0.5) 1px, transparent 1px)',
            backgroundSize: '2rem 2rem',
          }}
        />

        {pins.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
            <Icon name="location_off" size={22} className="text-fy-bone/50" />
            <MutedText className="text-fy-bone/70">{t('noPositionsHint')}</MutedText>
          </div>
        ) : (
          pins.map((p) => (
            <span
              key={p.v._id}
              className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
              title={p.v.registrationNumber}
            >
              <span
                className={`w-6 h-6 rounded-full border-2 border-fy-slate shadow-card flex items-center justify-center font-mono text-[9px] font-bold ${p.tone}`}
              >
                {p.label}
              </span>
              <span className="font-mono text-[8px] text-fy-bone/80 whitespace-nowrap">{p.v.registrationNumber}</span>
            </span>
          ))
        )}

        {spanKm !== null && (
          <span className="absolute bottom-2 right-2 font-mono text-[9px] text-fy-bone/70">
            {t('plotSpan', { km: spanKm })}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[10px] text-fy-bone/80">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="w-2 h-2 rounded-full bg-fy-lime" />
          {t('legendTransit')}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="w-2 h-2 rounded-full bg-fy-bone" />
          {t('legendStandby')}
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="w-2 h-2 rounded-full bg-fy-error" />
          {t('legendAlert')}
        </span>
      </div>
    </div>
  );
}
