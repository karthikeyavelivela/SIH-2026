'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { useBookingSocket } from '@/lib/useBookingSocket';
import { distanceKm } from '@/lib/geo';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { ChatPanel } from '@/components/worker/ChatPanel';
import { RatingModal } from '@/components/worker/RatingModal';
import { PaymentSection } from '@/components/booking/PaymentSection';
import { HaltTimeline } from '@/components/booking/HaltTimeline';
import { StarIcon, MessageIcon, UsersIcon } from '@/components/ui/icons';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow } from '@/components/fy/Data';
import { Button as FyButton } from '@/components/fy/Controls';
import { TopBar, TabRow } from '@/components/fy/Navigation';
import { CustomerTabBar } from '@/components/fy/CustomerTabBar';

// react-leaflet touches `window` at module load — must never run during
// Next's server render pass.
const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

interface BookingDetail {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  fareBreakdown: { baseFare: number; distanceFare: number; hamaliFare: number; total: number };
  pickupLocation: { address: string; coordinates: [number, number] };
  dropLocation: { address: string; coordinates: [number, number] };
  // Phase 6.3 — multi-stop routing.
  stops?: { address: string; coordinates: [number, number] }[];
  statusHistory: { status: string; timestamp: string }[];
  proofPhotos?: { pickup?: string; delivery?: string };
  // Phase 6.2 — load board with bidding.
  openForBidding?: boolean;
  // SIH26089 — self-declared goods info for a truck/combo booking.
  cargoDetails?: { weightKg: number; goodsType?: string; estimatedValueRupees?: number; ewayBillNumber?: string };
}

interface Bid {
  _id: string;
  amount: number;
  message?: string;
  bidderId: { _id: string; name: string; ratingAvg: number; ratingCount: number };
}

// Phase 6.2 — shown on a customer's own track page only while
// booking.openForBidding is still true (cleared the instant one bid is
// accepted, same booking object the rest of this page already polls/
// live-updates). Cheapest-first, matches loadboard.controller.ts's own
// listBidsForBooking sort — this is a decision screen, not just a log.
function BidsReviewSection({ bookingId, onAccepted }: { bookingId: string; onAccepted: (booking: BookingDetail) => void }) {
  const t = useTranslations('trackBooking');
  const { data, state } = usePolling(() => api.get<{ bids: Bid[] }>(`/api/loadboard/${bookingId}/bids`), 6000);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept(bidId: string) {
    setAcceptingId(bidId);
    setError(null);
    try {
      const res = await api.post<{ booking: BookingDetail }>(`/api/loadboard/${bookingId}/bids/${bidId}/accept`);
      onAccepted(res.booking);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorAcceptBid'));
    } finally {
      setAcceptingId(null);
    }
  }

  const bids = data?.bids ?? [];

  return (
    <Card elevation="raised" className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-fy-muted mb-3">{t('bidsReceived')}</p>
      {state === 'loading' && !data && <div className="h-16 rounded-card bg-fy-panel animate-pulse" />}
      {state !== 'loading' && bids.length === 0 && (
        <p className="text-sm text-fy-muted">{t('noBidsYet')}</p>
      )}
      {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
      <div className="space-y-3">
        {bids.map((bid) => (
          <div key={bid._id} className="flex items-center justify-between gap-3 p-3 rounded-control bg-fy-panel">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{bid.bidderId.name}</p>
              {bid.message && <p className="text-xs text-fy-muted truncate">{bid.message}</p>}
              <span className="inline-flex items-center gap-0.5 mt-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <StarIcon
                    key={i}
                    className={`w-3 h-3 ${i < Math.round(bid.bidderId.ratingAvg) ? 'text-fy-brown' : 'text-border-strong'}`}
                    fill={i < Math.round(bid.bidderId.ratingAvg) ? 'currentColor' : 'none'}
                  />
                ))}
              </span>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="font-heading font-bold mb-1.5">₹{bid.amount}</p>
              <Button className="!px-4 !py-2 !text-xs !min-h-0" disabled={acceptingId !== null} onClick={() => accept(bid._id)}>
                {acceptingId === bid._id ? t('accepting') : t('acceptBid')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

const STEPS = ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed'];

const statusTone: Record<string, 'success' | 'secondary' | 'muted' | 'danger'> = {
  completed: 'success',
  cancelled: 'danger',
};

function formatHistoryTime(iso: string) {
  const d = new Date(iso);
  return {
    time: d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

interface AssignedPerson {
  id: string;
  name: string;
  profilePhoto?: string;
  ratingAvg: number;
  ratingCount: number;
  vehicle?: { type: string; capacityKg: number; registrationNumber: string } | null;
}

// Raw phone numbers are never sent to the client (see emitters.ts) — no
// telephony/SMS-masking vendor is wired up, so the only safe contact
// channel is the in-app chat already on this page. This scrolls to it and
// focuses the input instead of pretending to place a masked call.
function focusChat() {
  const input = document.getElementById('booking-chat-input');
  input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (input as HTMLInputElement | null)?.focus();
}

// Full profile card, not a compact list row — this is what a customer
// actually wants to see once matched: who's coming, what they're driving/
// bringing, their track record, and a way to reach them.
function AssignedRow({ entry, sub }: { entry: AssignedPerson; sub?: 'vehicle' | 'group' }) {
  const t = useTranslations('trackBooking');
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      {sub === 'group' ? (
        <div className="w-11 h-11 rounded-full bg-fy-brown/15 text-fy-brown flex items-center justify-center flex-shrink-0">
          <UsersIcon className="w-5 h-5" />
        </div>
      ) : (
        <Avatar name={entry.name} photoUrl={entry.profilePhoto} accent="primary" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{entry.name}</p>
        {sub === 'vehicle' && entry.vehicle && (
          <p className="text-xs text-fy-muted truncate">
            {entry.vehicle.type.replace('_', ' ')} · {entry.vehicle.registrationNumber}
          </p>
        )}
        {sub === 'group' && <p className="text-xs text-fy-muted">{t('muthaGroup')}</p>}
        <span className="inline-flex items-center gap-0.5 mt-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon
              key={i}
              className={`w-3.5 h-3.5 ${i < Math.round(entry.ratingAvg) ? 'text-fy-brown' : 'text-border-strong'}`}
              fill={i < Math.round(entry.ratingAvg) ? 'currentColor' : 'none'}
            />
          ))}
          <span className="text-[11px] text-fy-muted ml-1">
            {entry.ratingCount > 0 ? `${entry.ratingAvg.toFixed(1)} (${entry.ratingCount})` : t('new')}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={focusChat}
        aria-label={t('messageAria', { name: entry.name })}
        className="w-9 h-9 rounded-full bg-fy-green/10 text-fy-green flex items-center justify-center flex-shrink-0 hover:bg-fy-green/20 transition-colors duration-fast"
      >
        <MessageIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function TrackBookingPage() {
  const t = useTranslations('trackBooking');
  const { bookingId } = useParams<{ bookingId: string }>();
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { status: liveStatus, matched, liveLocation, messages, sendChat } = useBookingSocket(bookingId);
  const [pendingRatingId, setPendingRatingId] = useState<string | null | undefined>(undefined);
  // The design's four-tab row: Status / Chat / Payment / Custody.
  const [tab, setTab] = useState<'status' | 'chat' | 'payment' | 'custody'>('status');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (booking?.status !== 'completed') return;
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => setPendingRatingId(null));
  }, [booking?.status]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await api.get<{ booking: BookingDetail }>(`/api/bookings/${bookingId}`);
        if (!cancelled) setBooking(res.booking);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : t('loadError'));
      }
    }

    load();
    // Poll every 8s as a fallback under the socket push above — a client
    // that missed an event (dropped connection, tab was backgrounded)
    // still self-heals within one poll interval instead of showing stale
    // status indefinitely.
    const interval = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bookingId]);

  // Socket push is the freshest source of truth for status when both are
  // available — merge it in without waiting for the next poll tick.
  useEffect(() => {
    if (liveStatus && booking && liveStatus !== booking.status) {
      setBooking({ ...booking, status: liveStatus });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveStatus]);

  if (error) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('pageTitle')} showBack />
        <main className="pt-16 px-gutter max-w-2xl mx-auto">
          <LightCard className="text-center py-10">
            <Body size="label">{error}</Body>
          </LightCard>
        </main>
        <CustomerTabBar />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('pageTitle')} showBack />
        <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-3">
          <div className="h-8 w-1/2 rounded bg-fy-panel animate-pulse" />
          <div className="h-40 rounded-card bg-fy-panel animate-pulse" />
        </main>
        <CustomerTabBar />
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(booking.status);
  const canCancel = !['completed', 'cancelled'].includes(booking.status);
  const [pLng, pLat] = booking.pickupLocation.coordinates;
  const [dLng, dLat] = booking.dropLocation.coordinates;

  async function handleCancel() {
    setCancelError(null);
    setCancelling(true);
    try {
      const res = await api.patch<{ booking: BookingDetail }>(`/api/bookings/${bookingId}/cancel`);
      setBooking(res.booking);
    } catch (err) {
      setCancelError(err instanceof ApiClientError ? err.message : t('errorCancel'));
    } finally {
      setCancelling(false);
    }
  }

  // Distance still to run, computed from the worker's own last GPS ping to
  // the drop point. The design prints a "14 mins" ETA beside it; nothing
  // server-side computes an ETA, and a travel-time estimate invented in the
  // browser is a number the customer would plan around, so only the
  // distance -- which is real -- is shown.
  const kmLeft =
    liveLocation && booking.status === 'in_progress'
      ? distanceKm({ lat: liveLocation.lat, lng: liveLocation.lng }, { lat: dLat, lng: dLng })
      : null;

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Clipboard blocked -- the URL is in the address bar either way.
    }
  }

  const assigned = matched?.assigned as Record<string, unknown> | undefined;
  const hasAssigned = assigned != null && Object.keys(assigned).length > 0;
  const chatOpen = !['requested', 'searching'].includes(booking.status);

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        title={t('pageTitle')}
        showBack
        actions={
          <StatusPill
            tone={booking.status === 'completed' ? 'lime' : booking.status === 'cancelled' ? 'critical' : 'neutral'}
          >
            {t(`historyStatus.${booking.status}` as never) ?? booking.status}
          </StatusPill>
        }
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <RouteMap
          pickup={{ lat: pLat, lng: pLng }}
          drop={{ lat: dLat, lng: dLng }}
          stops={(booking.stops ?? []).map((s) => ({ lat: s.coordinates[1], lng: s.coordinates[0] }))}
          liveMarker={liveLocation ? { lat: liveLocation.lat, lng: liveLocation.lng } : undefined}
          liveMarkerType={booking.type === 'hamali' ? 'hamali' : 'truck'}
          className="h-56 rounded-card overflow-hidden mt-2"
        />

        {/* Telemetry strip. Never implies live tracking that isn't flowing:
            a worker only streams position once they are in_progress AND
            their own device granted location permission, so until a ping
            actually arrives this says so rather than showing a frozen pin. */}
        {booking.status === 'in_progress' && (
          <LightCard className="flex items-start gap-3">
            <IconTile tone={liveLocation ? 'lime' : 'peach'} size="sm">
              <Icon name="satellite_alt" size={18} />
            </IconTile>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <EyebrowLabel tone={liveLocation ? 'green' : 'muted'}>{t('telemetrySync')}</EyebrowLabel>
                {liveLocation && (
                  <EyebrowLabel>
                    {t('liveLocationUpdated', {
                      seconds: Math.max(0, Math.round((Date.now() - liveLocation.at) / 1000)),
                    })}
                  </EyebrowLabel>
                )}
              </div>
              <Body size="label" className="mt-0.5">
                {liveLocation ? t('telemetryLocked') : t('waitingForLiveLocation')}
              </Body>
            </div>
          </LightCard>
        )}

        <TabRow
          variant="inset"
          active={tab}
          onChange={(k) => setTab(k as typeof tab)}
          tabs={[
            { key: 'status', label: t('tabStatus'), glyph: 'near_me' },
            { key: 'chat', label: t('tabChat'), glyph: 'forum' },
            { key: 'payment', label: t('tabPayment'), glyph: 'payments' },
            { key: 'custody', label: t('tabCustody'), glyph: 'inventory' },
          ]}
        />

        {tab === 'status' && (
          <>
            {(booking.status === 'requested' || booking.status === 'searching') && (
              <LightCard className="flex items-center gap-3">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-fy-brown/30 border-t-fy-brown animate-spin shrink-0" />
                <Body size="label">
                  {booking.openForBidding
                    ? t('waitingForBids')
                    : booking.status === 'requested'
                      ? t('waitingRequested')
                      : t('waitingSearching')}
                </Body>
              </LightCard>
            )}

            {booking.openForBidding && ['requested', 'searching'].includes(booking.status) && (
              <BidsReviewSection bookingId={bookingId} onAccepted={setBooking} />
            )}

            {stepIndex >= 0 && booking.status !== 'cancelled' && (
              <Panel className="p-4">
                <div className="flex items-center">
                  {STEPS.map((step, i) => (
                    <div key={step} className="flex items-center flex-1 last:flex-none">
                      <span className={`w-3 h-3 rounded-full shrink-0 ${i <= stepIndex ? 'bg-fy-green' : 'bg-fy-dim'}`} />
                      {i < STEPS.length - 1 && (
                        <span className={`h-0.5 flex-1 ${i < stepIndex ? 'bg-fy-green' : 'bg-fy-dim'}`} />
                      )}
                    </div>
                  ))}
                </div>
                {/* One legible line rather than six stacked labels: the
                    status names are long enough that printing all of them
                    under a six-dot bar wraps every one of them to three
                    lines on a phone. */}
                <div className="flex items-baseline justify-between gap-3 mt-3">
                  <p className="font-body text-body font-semibold text-fy-ink truncate">
                    {t(`historyStatus.${STEPS[stepIndex]}` as never) ?? STEPS[stepIndex]}
                  </p>
                  <EyebrowLabel>{t('stepOf', { step: stepIndex + 1, total: STEPS.length })}</EyebrowLabel>
                </div>
              </Panel>
            )}

            {kmLeft != null && (
              <Panel className="p-5">
                <MetricBlock
                  tone="green"
                  label={t('distanceLeft')}
                  value={kmLeft.toFixed(1)}
                  unit="km"
                  note={t('distanceLeftNote')}
                />
              </Panel>
            )}

            {hasAssigned && assigned && (
              <Section title={<SectionHeading>{t('assignedToYou')}</SectionHeading>}>
                <Panel>
                  {'driver' in assigned && assigned.driver != null && (
                    <AssignedRow entry={assigned.driver as AssignedPerson} sub="vehicle" />
                  )}
                  {'mutha' in assigned && assigned.mutha != null && (
                    <AssignedRow entry={assigned.mutha as AssignedPerson} sub="group" />
                  )}
                  {'hamalis' in assigned &&
                    Array.isArray(assigned.hamalis) &&
                    (assigned.hamalis as AssignedPerson[]).map((h) => <AssignedRow key={h.id} entry={h} />)}
                  {chatOpen && (
                    <FyButton
                      type="button"
                      variant="light"
                      size="md"
                      glyph="forum"
                      className="w-full mt-3"
                      onClick={() => setTab('chat')}
                    >
                      {t('tabChat')}
                    </FyButton>
                  )}
                </Panel>
              </Section>
            )}

            <LightCard className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <IconTile tone="peach" size="sm">
                  <Icon name="share_location" size={18} />
                </IconTile>
                <Body size="label">{t('shareLink')}</Body>
              </div>
              <button
                type="button"
                onClick={copyShareLink}
                className="shrink-0 inline-flex items-center gap-1.5 font-body text-label font-semibold text-fy-brown hover:underline"
              >
                <Icon name={linkCopied ? 'check' : 'content_copy'} size={16} />
                {linkCopied ? t('copied') : t('copy')}
              </button>
            </LightCard>

            <Section title={<SectionHeading>{t('bookingDetails')}</SectionHeading>}>
              <Panel className="flex flex-col gap-2">
                <StatRow label={t('trackingId')} value={booking._id.slice(-8).toUpperCase()} />
                <StatRow stacked label={t('pickupLabel')} value={booking.pickupLocation.address} />
                <StatRow stacked label={t('dropLabel')} value={booking.dropLocation.address} />
                {booking.stops?.map((s, i) => (
                  <StatRow key={i} stacked label={`${t('stops')} ${i + 1}`} value={s.address} />
                ))}
                {booking.cargoDetails?.goodsType && (
                  <StatRow label={t('goodsTypeLabel')} value={t(`goodsTypes.${booking.cargoDetails.goodsType}` as never)} />
                )}
                {booking.cargoDetails?.ewayBillNumber && (
                  <StatRow label={t('ewayBillLabel')} value={booking.cargoDetails.ewayBillNumber} />
                )}
              </Panel>
            </Section>

            <Link
              href={`/customer/support?bookingId=${bookingId}`}
              className="flex items-center gap-2 font-body text-label text-fy-muted hover:text-fy-ink"
            >
              <Icon name="report" size={16} />
              {t('reportIssue')}
            </Link>

            {cancelError && (
              <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
                {cancelError}
              </div>
            )}

            {canCancel && (
              <Button variant="ghost" className="w-full" onClick={handleCancel} disabled={cancelling}>
                {cancelling ? t('cancelling') : t('cancelBooking')}
              </Button>
            )}
          </>
        )}

        {tab === 'chat' &&
          (chatOpen ? (
            <ChatPanel messages={messages} currentUserId={user?._id} onSend={sendChat} accent="primary" />
          ) : (
            <LightCard>
              <Body size="label">{t('chatAfterMatch')}</Body>
            </LightCard>
          ))}

        {tab === 'payment' && (
          <>
            <Panel className="flex flex-col gap-2">
              <EyebrowLabel>{t('fare')}</EyebrowLabel>
              <StatRow label={t('baseFare')} value={`${'₹'}${booking.fareBreakdown.baseFare}`} />
              <StatRow label={t('distance')} value={`${'₹'}${booking.fareBreakdown.distanceFare}`} />
              {booking.fareBreakdown.hamaliFare > 0 && (
                <StatRow label={t('hamali')} value={`${'₹'}${booking.fareBreakdown.hamaliFare}`} />
              )}
              <Divider />
              <StatRow label={t('total')} value={`${'₹'}${booking.fareBreakdown.total}`} valueTone="green" />
            </Panel>
            {booking.status === 'completed' ? (
              <PaymentSection bookingId={bookingId} />
            ) : (
              <LightCard>
                <Body size="label">{t('paymentAfterCompletion')}</Body>
              </LightCard>
            )}
          </>
        )}

        {tab === 'custody' && (
          <>
            {/* Phase D.1 -- Secure Transit Checkpoints. Vehicle transit only
                (a hamali job has no in-transit exposure this addresses), and
                only once there is actually a transit leg to have halts on. */}
            {booking.type !== 'hamali' && ['in_progress', 'completed'].includes(booking.status) && (
              <HaltTimeline bookingId={bookingId} />
            )}

            {(booking.proofPhotos?.pickup || booking.proofPhotos?.delivery) && (
              <Section title={<SectionHeading>{t('photoProof')}</SectionHeading>}>
                <div className="flex gap-3">
                  {booking.proofPhotos?.pickup && (
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={booking.proofPhotos.pickup} alt="" className="w-28 h-28 rounded-card object-cover" />
                      <Body size="label" className="mt-1 text-center">
                        {t('pickupPhotoCaption')}
                      </Body>
                    </div>
                  )}
                  {booking.proofPhotos?.delivery && (
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={booking.proofPhotos.delivery} alt="" className="w-28 h-28 rounded-card object-cover" />
                      <Body size="label" className="mt-1 text-center">
                        {t('deliveryPhotoCaption')}
                      </Body>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {booking.statusHistory.length > 0 && (
              <Section title={<SectionHeading>{t('statusTimeline')}</SectionHeading>}>
                <Panel>
                  <div className="flex flex-col gap-4">
                    {[...booking.statusHistory].reverse().map((entry, i) => {
                      const { time, date } = formatHistoryTime(entry.timestamp);
                      return (
                        <div key={`${entry.status}-${entry.timestamp}`} className="flex gap-3">
                          <div className="flex flex-col items-center shrink-0">
                            <span className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-fy-green' : 'bg-fy-dim'}`} />
                            {i < booking.statusHistory.length - 1 && <span className="w-px flex-1 bg-fy-hairline mt-1" />}
                          </div>
                          <div className="pb-1 min-w-0">
                            <p className={`font-body text-label font-semibold ${i === 0 ? 'text-fy-green' : 'text-fy-ink'}`}>
                              {t(`historyStatus.${entry.status}` as never) ?? entry.status}
                            </p>
                            <Body size="label">
                              {time} · {date}
                            </Body>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>
              </Section>
            )}
          </>
        )}
      </main>

      {pendingRatingId === bookingId && (
        <RatingModal bookingId={bookingId} open accent="primary" onDone={() => setPendingRatingId(null)} />
      )}

      <CustomerTabBar />
    </div>
  );
}
