'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { DEFAULT_PLATFORM_COMMISSION_PCT } from '@/lib/platformCommission';
import { Booking, EarningsResponse } from '@/lib/types';
import { OnlineToggle } from '@/components/worker/OnlineToggle';
import { RatingModal } from '@/components/worker/RatingModal';
import { ServiceAreaCard } from '@/components/worker/ServiceAreaCard';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { DemandForecastWidget } from '@/components/worker/AgentWidgets';
import { TaraEntry } from '@/components/ui/TaraEntry';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button } from '@/components/fy/Controls';
import { MetricBlock, DataList, DataRow } from '@/components/fy/Data';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_dashboard_online.html.

   Section order there, top to bottom: 64px brand bar (eyebrow + serif
   "Home", a verified MEMBER pill) -> shift-active greeting with the
   worker's tier, rating and society -> DARK accent plate carrying today's
   ledger total with the trips line and the "settled to the co-op account,
   no commission" footer -> online/dispatch status card -> operational
   perimeter (radius + area) -> demand forecast -> AI desk -> 5-tab bar.

   Largest element: today's ledger total. Dark surfaces: the ledger plate.
   The accent is the role's own — brown for a driver, green for a hamali.

   Driver and hamali share this file because their two design screens are
   the same screen in two accents; only the route prefix and accent differ. */

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function WorkerDashboard({
  base,
  accent,
  radiusKm,
}: {
  base: '/driver' | '/hamali';
  accent: 'primary' | 'secondary';
  radiusKm: number;
}) {
  const t = useTranslations('workerDashboard');
  const { user } = useAuth();
  const [status, setStatus] = useState<'online' | 'offline' | 'on_job' | null>(null);
  const [willingLocation, setWillingLocation] = useState<{ lat: number; lng: number } | null | undefined>(undefined);
  // Proactive mandatory-rating prompt — otherwise a worker only discovers
  // they are blocked when Accept fails with a 403 they have to decode.
  const [pendingRatingId, setPendingRatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ availabilityStatus: 'online' | 'offline' | 'on_job'; willingLocation: { coordinates: [number, number] } | null }>(
        '/api/availability'
      )
      .then((res) => {
        setStatus(res.availabilityStatus);
        setWillingLocation(
          res.willingLocation?.coordinates
            ? { lat: res.willingLocation.coordinates[1], lng: res.willingLocation.coordinates[0] }
            : null
        );
      })
      .catch((err) => {
        // A driver with no Vehicle yet (KYC/vehicle setup incomplete) still
        // sees a working dashboard — just without a toggle.
        if (err instanceof ApiClientError) {
          setStatus(null);
          setWillingLocation(null);
        }
      });
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => {});
  }, []);

  const { data: mine } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 8000);
  const activeJob = mine?.bookings.find((b) => b.status === 'accepted' || b.status === 'in_progress');
  /* A crew booking the worker has taken a seat on but which has not filled
     yet. It is NOT an active job — it has no stages to walk — but it does
     hold the worker off every other job, so leaving it off this screen made
     the dashboard say "standby" while the matcher considered the worker
     busy, with no way to see or undo the commitment. */
  const heldSeat = mine?.bookings.find((b) => b.status === 'searching' || b.status === 'requested');
  const [releasing, setReleasing] = useState(false);
  const [releaseError, setReleaseError] = useState<string | null>(null);

  async function releaseSeat(bookingId: string) {
    setReleasing(true);
    setReleaseError(null);
    try {
      await api.post(`/api/requests/${bookingId}/withdraw`, {});
      window.location.reload();
    } catch {
      setReleaseError(t('heldSeatError'));
    } finally {
      setReleasing(false);
    }
  }
  const { data: earnings } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);
  const todayLines =
    earnings?.lines.filter((l) => l.completedAt && new Date(l.completedAt).getTime() >= startOfToday()) ?? [];
  const todayTotal = todayLines.reduce((sum, l) => sum + l.amount, 0);

  const firstName = user?.name?.split(' ')[0] ?? '';
  const dark = accent === 'primary' ? 'bg-fy-brown' : 'bg-fy-green';
  const ratingLabel = user?.ratingCount ? user.ratingAvg?.toFixed(2) : t('new');

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('homeTitle')}
        actions={
          <>
            {user?.accountStatus === 'active' && <StatusPill tone="lime">{t('memberPill')}</StatusPill>}
            <NotificationBell href={`${base}/notifications`} />
          </>
        }
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <NotificationPrompt accent={accent} copy={t('notifyPrompt')} />

        <div className="flex items-center gap-3.5 pt-2">
          <Avatar name={user?.name ?? '?'} photoUrl={user?.profilePhoto} accent={accent} size="lg" status={status ?? undefined} />
          <div className="min-w-0 flex-1">
            <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>
              {status === 'online' ? t('shiftActive') : status === 'on_job' ? t('shiftOnJob') : t('shiftOffline')}
            </EyebrowLabel>
            <h2 className="font-heading text-heading text-fy-ink leading-tight truncate">
              {firstName ? t('greeting', { name: firstName }) : t('greetingNoName')}
            </h2>
            <Body size="label" className="truncate">
              {ratingLabel} ★{user?.ratingCount ? ` · ${t('ratingCount', { count: user.ratingCount })}` : ''}
              {user?.region ? ` · ${user.region}` : ''}
            </Body>
          </div>
        </div>

        {/* Today's ledger — the screen's largest element. Real earnings
            lines from /api/earnings/me, never a projected or padded figure. */}
        <div className={`${dark} text-fy-bone rounded-sheet p-5 shadow-card flex flex-col gap-3`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <EyebrowLabel tone="on-dark" className="opacity-70">
                {t('todaysLedger')}
              </EyebrowLabel>
            </div>
            <StatusPill tone="lime" className="shrink-0">
              {t('instantAudit')}
            </StatusPill>
          </div>
          <MetricBlock
            onDark
            tone="on-dark"
            label={t('todaysEarnings')}
            value={`₹${todayTotal}`}
            note={t('tripsToday', { count: todayLines.length })}
          />
          <Divider className="border-fy-bone/15" />
          <div className="flex items-center justify-between gap-3">
            <EyebrowLabel tone="on-dark" className="opacity-70">
              {t('settledNote', { pct: earnings?.platformRatePct ?? DEFAULT_PLATFORM_COMMISSION_PCT })}
            </EyebrowLabel>
            <Link
              href={`${base}/earnings`}
              className="shrink-0 inline-flex items-center gap-1 font-body text-label font-semibold text-fy-lime hover:underline"
            >
              {t('viewEarnings')}
              <Icon name="chevron_right" size={16} />
            </Link>
          </div>
        </div>

        {status !== null && <OnlineToggle status={status} onStatusChange={(s) => setStatus(s)} accent={accent} />}

        {/* Dispatch state. The design shows a queue position ("Position #3",
            "~4 min wait"); the matching engine offers jobs sequentially but
            exposes no queue position or wait estimate to a worker, so this
            shows the state that is real: an active job, or standby. */}
        {activeJob ? (
          <Link href={`${base}/active-job/${activeJob._id}`} className="block">
            <Panel className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>{t('activeJob')}</EyebrowLabel>
                <StatusPill tone="neutral">{t(`status.${activeJob.status}` as never) ?? activeJob.status}</StatusPill>
              </div>
              <DataList>
                <DataRow
                  lead={
                    <IconTile tone="peach" size="md" className="rounded-full">
                      <Icon name="trip_origin" size={18} />
                    </IconTile>
                  }
                  title={activeJob.pickupLocation.address}
                />
                <DataRow
                  lead={
                    <IconTile tone="lime" size="md" className="rounded-full">
                      <Icon name="location_on" size={18} />
                    </IconTile>
                  }
                  title={activeJob.dropLocation.address}
                />
              </DataList>
              <span className="inline-flex items-center gap-1 font-body text-label font-semibold text-fy-brown">
                {t('viewJob')}
                <Icon name="chevron_right" size={16} />
              </span>
            </Panel>
          </Link>
        ) : heldSeat ? (
          <Panel className="flex flex-col gap-3">
            <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>{t('heldSeatTitle')}</EyebrowLabel>
            <DataList>
              <DataRow
                lead={
                  <IconTile tone="peach" size="md" className="rounded-full">
                    <Icon name="trip_origin" size={18} />
                  </IconTile>
                }
                title={heldSeat.pickupLocation.address}
              />
              <DataRow
                lead={
                  <IconTile tone="lime" size="md" className="rounded-full">
                    <Icon name="location_on" size={18} />
                  </IconTile>
                }
                title={heldSeat.dropLocation.address}
              />
            </DataList>
            <Body size="label">{t('heldSeatNote')}</Body>
            {releaseError && <Body size="label">{releaseError}</Body>}
            <Button
              variant="ghost"
              size="md"
              glyph="logout"
              disabled={releasing}
              onClick={() => releaseSeat(heldSeat._id)}
            >
              {releasing ? t('heldSeatReleasing') : t('heldSeatRelease')}
            </Button>
          </Panel>
        ) : (
          <LightCard className="flex items-center gap-3">
            <IconTile tone={accent === 'primary' ? 'peach' : 'lime'} size="md">
              <Icon name="hourglass_empty" size={20} />
            </IconTile>
            <div className="min-w-0">
              <p className="font-body text-body font-semibold text-fy-ink">{t('standbyTitle')}</p>
              <Body size="label">{status === 'online' ? t('standbyOnline') : t('standbyOffline')}</Body>
            </div>
          </LightCard>
        )}

        {willingLocation !== undefined && (
          <Section
            title={<SectionHeading>{t('perimeterHeading')}</SectionHeading>}
            aside={<EyebrowLabel>{t('radius', { km: radiusKm })}</EyebrowLabel>}
          >
            <ServiceAreaCard initial={willingLocation} radiusKm={radiusKm} accent={accent} />
          </Section>
        )}

        <DemandForecastWidget region={user?.region} accent={accent} />
        <TaraEntry accent={accent} />

        <DataList>
          <DataRow
            lead={
              <IconTile tone={accent === 'primary' ? 'peach' : 'lime'} size="md" className="rounded-full">
                <Icon name="fact_check" size={18} />
              </IconTile>
            }
            title={t('openRequests')}
            trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
            onClick={() => (window.location.href = `${base}/requests`)}
          />
          <DataRow
            lead={
              <IconTile tone="slate-pale" size="md" className="rounded-full">
                <Icon name="shield" size={18} />
              </IconTile>
            }
            title={t('insuranceProtection')}
            trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
            onClick={() => (window.location.href = `${base}/insurance`)}
          />
          <DataRow
            lead={
              <IconTile tone="peach" size="md" className="rounded-full">
                <Icon name="school" size={18} />
              </IconTile>
            }
            title={t('training')}
            trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
            onClick={() => (window.location.href = `${base}/training`)}
          />
        </DataList>

        {pendingRatingId && (
          <RatingModal
            bookingId={pendingRatingId}
            open
            accent={accent}
            title={t('rateLastCustomer')}
            onDone={() => setPendingRatingId(null)}
          />
        )}
      </main>

    </div>
  );
}
