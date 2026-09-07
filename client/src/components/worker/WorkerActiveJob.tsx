'use client';

import { useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { useBookingSocket } from '@/lib/useBookingSocket';
import { useLiveLocationBroadcast } from '@/lib/useLiveLocationBroadcast';
import { distanceKm } from '@/lib/geo';
import { Booking } from '@/lib/types';
import { ChatPanel } from '@/components/worker/ChatPanel';
import { RatingModal } from '@/components/worker/RatingModal';
import { PhotoProofCapture } from '@/components/worker/PhotoProofCapture';
import { HaltCheckIn } from '@/components/worker/HaltCheckIn';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow } from '@/components/fy/Data';
import { Button } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_active_job.html.

   Section order there, top to bottom: back bar with a LIVE TELEMETRY strip
   -> a DARK corridor plate carrying the distance remaining -> the mandate
   number and its on-track status -> the consignor card -> agreed freight ->
   destination bay -> manifest cargo -> compliance audit (proof photos
   filed) -> mandatory checkpoint halt check-in -> consignment pass and
   e-way validity -> a four-stage progress row -> call client / call guild
   -> the primary stage action.

   Largest element: the distance remaining, then the freight figure. Dark
   surfaces: the corridor plate. Accent is the role's own.

   Driver and hamali share this file: their two design screens are the same
   screen with different stage labels, and the two pages had drifted into
   near-copies. Only the manifest link and the transit halt check-in are
   driver-only, because a hamali job has no vehicle transit leg.

   Not invented: the design prints "₹1,833 net to wallet" beside the fare,
   a "Match" score, a tamper-wire seal id, and an odometer reading. A
   worker's deduction is their society's own commission and welfare rate
   rather than a flat platform figure, and nothing stores seal ids or
   odometer values, so none of those four appear. */

// react-leaflet touches `window` at module load — never during Next's SSR pass.
const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

const STEP_STATUSES = ['accepted', 'in_progress', 'completed'] as const;

export function WorkerActiveJob({ base, accent }: { base: '/driver' | '/hamali'; accent: 'primary' | 'secondary' }) {
  const role = base === '/driver' ? 'driver' : 'hamali';
  const t = useTranslations('activeJob.common');
  const tRole = useTranslations(`activeJob.${role}` as never);
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showRating, setShowRating] = useState(false);

  const { data, reload } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 6000, [bookingId]);
  const booking = data?.bookings.find((b) => b._id === bookingId);
  const { messages, sendChat } = useBookingSocket(bookingId);
  const myPosition = useLiveLocationBroadcast(bookingId, booking?.status === 'in_progress');

  async function advance() {
    if (!booking) return;
    setPending(true);
    setError(null);
    try {
      const action = booking.status === 'accepted' ? 'start' : 'complete';
      await api.post(`/api/requests/${booking._id}/${action}`);
      if (action === 'complete') {
        setShowRating(true); // mandatory-rating prompt before leaving this screen
      } else {
        await reload();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setPending(false);
    }
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('title')} showBack onBack={() => router.push(`${base}/dashboard`)} />
        <main className="pt-16 px-gutter max-w-2xl mx-auto">
          <Body size="label">{t('loadingJob')}</Body>
        </main>
      </div>
    );
  }

  const stepIndex = STEP_STATUSES.indexOf(booking.status as (typeof STEP_STATUSES)[number]);
  const pickupConfirmed = !!booking.proofPhotos?.pickup;
  const deliveryConfirmed = !!booking.proofPhotos?.delivery;
  const photosFiled = (pickupConfirmed ? 1 : 0) + (deliveryConfirmed ? 1 : 0);
  const stageReady = booking.status === 'accepted' ? pickupConfirmed : deliveryConfirmed;
  const dark = accent === 'primary' ? 'bg-fy-brown' : 'bg-fy-green';

  const [dLng, dLat] = booking.dropLocation.coordinates;
  // Distance to the drop from the worker's own GPS. Real; the design's
  // "14 min" ETA beside it is not — nothing computes travel time.
  const kmLeft =
    myPosition && booking.status === 'in_progress' ? distanceKm(myPosition, { lat: dLat, lng: dLng }) : null;

  const weightKg = booking.cargoDetails?.weightKg ?? 0;
  const goodsType = booking.cargoDetails?.goodsType;

  const stageLabels = [t('stepAccepted'), tRole('stepInTransit'), tRole('stepDelivered')];

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Services"
        title={t('title')}
        showBack
        onBack={() => router.push(`${base}/dashboard`)}
        actions={<StatusPill tone={booking.status === 'in_progress' ? 'lime' : 'neutral'}>{t(`status.${booking.status}` as never) ?? booking.status}</StatusPill>}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <RouteMap
          pickup={{ lat: booking.pickupLocation.coordinates[1], lng: booking.pickupLocation.coordinates[0] }}
          drop={{ lat: dLat, lng: dLng }}
          className="h-56 rounded-card overflow-hidden mt-2"
        />

        {/* Corridor plate. Only appears once the job is actually under way
            and a GPS fix has arrived — never a frozen number. */}
        {booking.status === 'in_progress' && (
          <div className={`${dark} text-fy-bone rounded-sheet p-5 shadow-card flex flex-col gap-2`}>
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-fy-lime animate-pulse" />
              <EyebrowLabel tone="lime">{myPosition ? t('liveTelemetry') : t('awaitingFix')}</EyebrowLabel>
            </span>
            {kmLeft != null ? (
              <MetricBlock
                onDark
                tone="lime"
                label={t('remaining')}
                value={kmLeft.toFixed(1)}
                unit="km"
                note={t('remainingNote')}
              />
            ) : (
              <Body tone="on-dark" size="label" className="opacity-85">
                {t('sharingLocation')}
              </Body>
            )}
          </div>
        )}

        <Panel className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <EyebrowLabel>{t('mandate', { id: booking._id.slice(-6).toUpperCase() })}</EyebrowLabel>
              <SectionHeading as="h3" className="truncate">
                {booking.dropLocation.address.split(',')[0]}
              </SectionHeading>
            </div>
            <div className="text-right shrink-0">
              <EyebrowLabel>{tRole('agreedFreight')}</EyebrowLabel>
              <p className="font-heading text-title text-fy-ink">₹{booking.fareBreakdown.total}</p>
            </div>
          </div>

          <Divider />

          <div className="flex flex-col gap-2">
            <StatRow stacked label={t('pickupLabel')} value={booking.pickupLocation.address} />
            <StatRow stacked label={t('destinationBay')} value={booking.dropLocation.address} />
            {weightKg > 0 && (
              <StatRow
                label={t('manifestCargo')}
                value={`${(weightKg / 1000).toFixed(weightKg < 1000 ? 2 : 1)} T${goodsType ? ` · ${t(`goodsTypes.${goodsType}` as never) ?? goodsType}` : ''}`}
              />
            )}
            {booking.cargoDetails?.ewayBillNumber && (
              <StatRow label={t('ewayBill')} value={booking.cargoDetails.ewayBillNumber} />
            )}
          </div>
        </Panel>

        {booking.customer && (
          <Panel className="flex items-center gap-3">
            <Avatar name={booking.customer.name} photoUrl={booking.customer.profilePhoto} accent={accent} />
            <div className="min-w-0 flex-1">
              <EyebrowLabel>{t('consignor')}</EyebrowLabel>
              <p className="font-body text-body font-semibold text-fy-ink truncate">{booking.customer.name}</p>
              <Body size="label">
                {booking.customer.ratingCount > 0
                  ? `${booking.customer.ratingAvg.toFixed(1)} ★ (${booking.customer.ratingCount})`
                  : t('newRating')}
              </Body>
            </div>
            {/* The design has a "Call Client" dialer here. The customer's
                phone number is deliberately NOT sent to workers — the
                requests endpoint populates name, photo and rating only — so
                this opens the booking-scoped chat rather than inventing a
                contact channel or widening what a worker can see. */}
            <button
              type="button"
              aria-label={t('messageCustomer')}
              onClick={() => document.getElementById('job-chat')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 ${
                accent === 'primary' ? 'bg-fy-brown text-fy-on-brown' : 'bg-fy-green text-fy-on-green'
              }`}
            >
              <Icon name="forum" size={18} />
            </button>
          </Panel>
        )}

        {/* Compliance audit — the design's "1 of 2 Filed". Both figures are
            the real PhotoProofCapture uploads. */}
        <LightCard className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile tone={photosFiled === 2 ? 'lime' : 'peach'} size="md">
              <Icon name="done_all" size={20} />
            </IconTile>
            <div className="min-w-0">
              <p className="font-body text-label font-semibold text-fy-ink">{t('complianceAudit')}</p>
              <Body size="label">{t('photosFiled', { filed: photosFiled, total: 2 })}</Body>
            </div>
          </div>
          <StatusPill tone={photosFiled === 2 ? 'lime' : 'outline'}>
            {photosFiled === 2 ? t('complete') : t('pending')}
          </StatusPill>
        </LightCard>

        {(booking.status === 'accepted' || booking.status === 'in_progress') && (
          <PhotoProofCapture
            bookingId={booking._id}
            stage={booking.status === 'accepted' ? 'pickup' : 'delivery'}
            existingUrl={booking.status === 'accepted' ? booking.proofPhotos?.pickup : booking.proofPhotos?.delivery}
            onUploaded={() => reload()}
            accent={accent}
          />
        )}

        {/* Manifest and transit halts are vehicle-only: a hamali job has no
            transit leg to check in from and no bill of lading to sign. */}
        {base === '/driver' && booking.status === 'accepted' && pickupConfirmed && (
          <Link href={`${base}/active-job/${booking._id}/manifest`} className="block">
            <LightCard className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <IconTile tone="peach" size="md">
                  <Icon name="description" size={20} />
                </IconTile>
                <div className="min-w-0">
                  <p className="font-body text-label font-semibold text-fy-ink">{tRole('manifestTitle')}</p>
                  <Body size="label">{tRole('manifestSubtitle')}</Body>
                </div>
              </div>
              <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
            </LightCard>
          </Link>
        )}

        {base === '/driver' && booking.status === 'in_progress' && booking.type !== 'hamali' && (
          <HaltCheckIn bookingId={booking._id} accent={accent} />
        )}

        {/* Stage row — three real booking statuses, not the design's four. */}
        <Panel className="p-4">
          <div className="flex items-center">
            {stageLabels.map((label, i) => (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-body text-label font-bold ${
                    i <= stepIndex
                      ? accent === 'primary'
                        ? 'bg-fy-brown text-fy-on-brown'
                        : 'bg-fy-green text-fy-on-green'
                      : 'bg-fy-field text-fy-ink-soft'
                  }`}
                >
                  {i < stepIndex ? <Icon name="check" size={16} /> : i + 1}
                </span>
                {i < stageLabels.length - 1 && (
                  <span
                    className={`h-0.5 flex-1 mx-1.5 ${
                      i < stepIndex ? (accent === 'primary' ? 'bg-fy-brown' : 'bg-fy-green') : 'bg-fy-dim'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-baseline justify-between gap-3 mt-3">
            <p className="font-body text-body font-semibold text-fy-ink truncate">{stageLabels[Math.max(0, stepIndex)]}</p>
            <EyebrowLabel>{t('stepOf', { step: Math.max(0, stepIndex) + 1, total: stageLabels.length })}</EyebrowLabel>
          </div>
        </Panel>

        <Section title={<SectionHeading>{t('chatHeading')}</SectionHeading>} className="scroll-mt-20" id="job-chat">
          <ChatPanel messages={messages} currentUserId={user?._id} onSend={sendChat} accent={accent} />
        </Section>

        {error && (
          <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
            {error}
          </div>
        )}

        {booking.status !== 'completed' && (
          <>
            {!pending && !stageReady && (
              <Body size="label" className="text-center">
                {t('takePhotoToContinue', {
                  stage: booking.status === 'accepted' ? t('stagePickup') : t('stageDelivery'),
                })}
              </Body>
            )}
            <Button
              variant={accent === 'primary' ? 'brown' : 'green'}
              trailingGlyph="arrow_forward"
              className="w-full"
              disabled={pending || !stageReady}
              onClick={advance}
            >
              {pending ? t('updating') : booking.status === 'accepted' ? tRole('startTrip') : tRole('markDelivered')}
            </Button>
          </>
        )}
      </main>

      <RatingModal
        bookingId={booking._id}
        open={showRating}
        accent={accent}
        title={t('rateCustomer')}
        onDone={() => router.push(`${base}/dashboard`)}
      />
    </div>
  );
}
