'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useBookingSocket } from '@/lib/useBookingSocket';
import { Payment } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { BackHeader } from '@/components/ui/BackHeader';
import { ChatPanel } from '@/components/worker/ChatPanel';
import { RatingModal } from '@/components/worker/RatingModal';
import { TruckIcon, BoxIcon, StarIcon, AlertIcon, MessageIcon, UsersIcon } from '@/components/ui/icons';

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
  statusHistory: { status: string; timestamp: string }[];
  proofPhotos?: { pickup?: string; delivery?: string };
}

const STEPS = ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed'];

const statusTone: Record<string, 'success' | 'secondary' | 'muted' | 'danger'> = {
  completed: 'success',
  cancelled: 'danger',
};

const waitingCopy: Record<string, string> = {
  requested: 'Confirming your request…',
  searching: 'Waiting for a driver or Hamali to respond…',
};

const historyStatusLabel: Record<string, string> = {
  requested: 'Requested',
  searching: 'Finding a match',
  matched: 'Matched',
  accepted: 'Accepted',
  in_progress: 'Picked up — on the way',
  completed: 'Delivered',
  cancelled: 'Cancelled',
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
  return (
    <div className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      {sub === 'group' ? (
        <div className="w-11 h-11 rounded-full bg-primary/15 text-primary-600 flex items-center justify-center flex-shrink-0">
          <UsersIcon className="w-5 h-5" />
        </div>
      ) : (
        <Avatar name={entry.name} photoUrl={entry.profilePhoto} accent="primary" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{entry.name}</p>
        {sub === 'vehicle' && entry.vehicle && (
          <p className="text-xs text-text-muted truncate">
            {entry.vehicle.type.replace('_', ' ')} · {entry.vehicle.registrationNumber}
          </p>
        )}
        {sub === 'group' && <p className="text-xs text-text-muted">Mutha group</p>}
        <span className="inline-flex items-center gap-0.5 mt-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <StarIcon
              key={i}
              className={`w-3.5 h-3.5 ${i < Math.round(entry.ratingAvg) ? 'text-primary-600' : 'text-border-strong'}`}
              fill={i < Math.round(entry.ratingAvg) ? 'currentColor' : 'none'}
            />
          ))}
          <span className="text-[11px] text-text-muted ml-1">
            {entry.ratingCount > 0 ? `${entry.ratingAvg.toFixed(1)} (${entry.ratingCount})` : 'New'}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={focusChat}
        aria-label={`Message ${entry.name}`}
        className="w-9 h-9 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center flex-shrink-0 hover:bg-secondary/20 transition-colors duration-fast"
      >
        <MessageIcon className="w-4 h-4" />
      </button>
    </div>
  );
}

function PaymentSection({ bookingId }: { bookingId: string }) {
  const [payment, setPayment] = useState<Payment | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api
      .get<{ payment: Payment | null }>(`/api/payments/${bookingId}`)
      .then((res) => setPayment(res.payment))
      .catch(() => setPayment(null));
  }, [bookingId]);

  async function payNow() {
    setPending(true);
    setError(null);
    try {
      const orderRes = await api.post<{ payment: Payment }>(`/api/payments/order/${bookingId}`);
      // Mock mode only — a real deployment redirects into Razorpay's
      // Checkout here instead and lets the webhook confirm success async.
      const captured = await api.post<{ payment: Payment }>(`/api/payments/${bookingId}/mock-capture`);
      setPayment(captured.payment ?? orderRes.payment);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Payment failed — try again.');
    } finally {
      setPending(false);
    }
  }

  if (payment === undefined) return <div className="h-16 rounded-lg bg-surface animate-pulse mb-4" />;

  return (
    <Card elevation="raised" className="mb-4">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Payment</p>
        {payment && (
          <Badge tone={payment.status === 'success' ? 'success' : payment.status === 'failed' ? 'danger' : 'muted'}>
            {payment.status}
          </Badge>
        )}
      </div>
      {payment?.status === 'success' ? (
        <p className="text-sm text-text-muted">Paid ₹{payment.amount}.</p>
      ) : (
        <>
          {error && <p className="text-sm text-red-700 mb-2">{error}</p>}
          <Button className="w-full mt-2" disabled={pending} onClick={payNow}>
            {pending ? 'Processing…' : 'Pay now'}
          </Button>
        </>
      )}
    </Card>
  );
}

export default function TrackBookingPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const { status: liveStatus, matched, liveLocation, messages, sendChat } = useBookingSocket(bookingId);
  const [pendingRatingId, setPendingRatingId] = useState<string | null | undefined>(undefined);

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
        if (!cancelled) setError(err instanceof ApiClientError ? err.message : 'Could not load this booking.');
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
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title="Track booking" fallbackHref="/customer/dashboard" />
        <Card elevation="raised" className="text-center py-10 text-sm text-text-muted mx-5 mt-6">
          {error}
        </Card>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title="Track booking" fallbackHref="/customer/dashboard" />
        <div className="px-5 pt-6 space-y-3">
          <div className="h-8 w-1/2 rounded bg-surface animate-pulse" />
          <div className="h-40 rounded-lg bg-surface animate-pulse" />
        </div>
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
      setCancelError(err instanceof ApiClientError ? err.message : 'Could not cancel this booking.');
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto pb-6">
      <BackHeader title="Track booking" fallbackHref="/customer/dashboard" />
      <div className="px-5 pt-6">
      <div className="flex items-center justify-end mb-6">
        <Badge tone={statusTone[booking.status] ?? 'secondary'}>{booking.status.replace('_', ' ')}</Badge>
      </div>

      <Card elevation="raised" className="mb-4">
        <div className="grid grid-cols-2 gap-y-4 gap-x-3 text-sm">
          <div>
            <p className="text-[11px] text-text-muted mb-0.5">Tracking ID</p>
            <p className="font-heading font-bold tracking-wide">{booking._id.slice(-8).toUpperCase()}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-muted mb-0.5">Type</p>
            <p className="font-semibold capitalize">{booking.type}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-muted mb-0.5">Status</p>
            <p className="font-semibold capitalize">{booking.status.replace('_', ' ')}</p>
          </div>
          <div>
            <p className="text-[11px] text-text-muted mb-0.5">Total fare</p>
            <p className="font-semibold">₹{booking.fareBreakdown.total}</p>
          </div>
        </div>
      </Card>

      {waitingCopy[booking.status] && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-md bg-primary/10 text-sm text-primary-600">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-600/30 border-t-primary-600 animate-spin flex-shrink-0" />
          {waitingCopy[booking.status]}
        </div>
      )}

      <RouteMap
        pickup={{ lat: pLat, lng: pLng }}
        drop={{ lat: dLat, lng: dLng }}
        liveMarker={liveLocation ? { lat: liveLocation.lat, lng: liveLocation.lng } : undefined}
        liveMarkerType={booking.type === 'hamali' ? 'hamali' : 'truck'}
        className="h-48 mb-3"
      />

      {/* Honest GPS state — never implies live tracking that isn't
          actually flowing. A driver/hamali only streams position once
          they're in_progress AND their own device granted location
          permission (see useLiveLocationBroadcast); until a ping actually
          arrives this says so plainly instead of a silently frozen pin. */}
      {booking.status === 'in_progress' && (
        <p className="flex items-center gap-1.5 text-xs text-text-muted mb-6 -mt-1">
          {liveLocation ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live location — updated {Math.max(0, Math.round((Date.now() - liveLocation.at) / 1000))}s ago
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40" />
              Waiting for their live location…
            </>
          )}
        </p>
      )}

      {stepIndex >= 0 && booking.status !== 'cancelled' && (
        <div className="flex items-center mb-8">
          {STEPS.map((step, i) => (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div
                className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  i <= stepIndex ? 'bg-primary-600' : 'bg-border-strong'
                }`}
              />
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 ${i < stepIndex ? 'bg-primary-600' : 'bg-border-strong'}`} />
              )}
            </div>
          ))}
        </div>
      )}

      {booking.statusHistory.length > 0 && (
        <Card elevation="raised" className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-4">Status timeline</p>
          <div className="space-y-4">
            {[...booking.statusHistory].reverse().map((entry, i) => {
              const { time, date } = formatHistoryTime(entry.timestamp);
              return (
                <div key={`${entry.status}-${entry.timestamp}`} className="flex gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <span className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-primary-600' : 'bg-border-strong'}`} />
                    {i < booking.statusHistory.length - 1 && <span className="w-px flex-1 bg-border mt-1" />}
                  </div>
                  <div className="pb-1 min-w-0">
                    <p className={`text-sm font-semibold ${i === 0 ? 'text-primary-600' : ''}`}>
                      {historyStatusLabel[entry.status] ?? entry.status}
                    </p>
                    <p className="text-xs text-text-muted">
                      {time} · {date}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {matched?.assigned && Object.keys(matched.assigned).length > 0 && (
        <Card elevation="raised" className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">Assigned to you</p>
          {'driver' in matched.assigned && matched.assigned.driver != null && (
            <AssignedRow entry={matched.assigned.driver as AssignedPerson} sub="vehicle" />
          )}
          {'mutha' in matched.assigned && matched.assigned.mutha != null && (
            <AssignedRow entry={matched.assigned.mutha as AssignedPerson} sub="group" />
          )}
          {'hamalis' in matched.assigned &&
            Array.isArray(matched.assigned.hamalis) &&
            (matched.assigned.hamalis as AssignedPerson[]).map((h) => <AssignedRow key={h.id} entry={h} />)}
        </Card>
      )}

      {!['requested', 'searching'].includes(booking.status) && (
        <div className="mb-4">
          <ChatPanel messages={messages} currentUserId={user?._id} onSend={sendChat} accent="primary" />
        </div>
      )}

      <Card elevation="raised" className="mb-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center">
            {booking.type === 'hamali' ? <BoxIcon className="w-5 h-5" /> : <TruckIcon className="w-5 h-5" />}
          </div>
          <p className="font-semibold capitalize">{booking.type} booking</p>
        </div>
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-text-muted">Pickup: </span>
            {booking.pickupLocation.address}
          </p>
          <p>
            <span className="text-text-muted">Drop: </span>
            {booking.dropLocation.address}
          </p>
        </div>
      </Card>

      {(booking.proofPhotos?.pickup || booking.proofPhotos?.delivery) && (
        <Card elevation="raised" className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">Photo proof</p>
          <div className="flex gap-3">
            {booking.proofPhotos?.pickup && (
              <div>
                <img src={booking.proofPhotos.pickup} alt="Pickup proof" className="w-24 h-24 rounded-md object-cover" />
                <p className="text-[11px] text-text-muted mt-1 text-center">Pickup</p>
              </div>
            )}
            {booking.proofPhotos?.delivery && (
              <div>
                <img src={booking.proofPhotos.delivery} alt="Delivery proof" className="w-24 h-24 rounded-md object-cover" />
                <p className="text-[11px] text-text-muted mt-1 text-center">Delivery</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <Card elevation="raised">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">Fare</p>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Base fare</span>
            <span>₹{booking.fareBreakdown.baseFare}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Distance</span>
            <span>₹{booking.fareBreakdown.distanceFare}</span>
          </div>
          {booking.fareBreakdown.hamaliFare > 0 && (
            <div className="flex justify-between">
              <span className="text-text-muted">Hamali</span>
              <span>₹{booking.fareBreakdown.hamaliFare}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 mt-2 border-t border-border font-heading font-bold">
            <span>Total</span>
            <span>₹{booking.fareBreakdown.total}</span>
          </div>
        </div>
      </Card>

      {booking.status === 'completed' && <PaymentSection bookingId={bookingId} />}

      <Link
        href={`/customer/support?bookingId=${bookingId}`}
        className="flex items-center gap-2 text-sm text-text-muted hover:text-text-primary mb-4"
      >
        <AlertIcon className="w-4 h-4" />
        Report an issue with this booking
      </Link>

      {cancelError && (
        <div role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {cancelError}
        </div>
      )}

      {canCancel && (
        <Button
          variant="ghost"
          className="w-full mt-4"
          onClick={handleCancel}
          disabled={cancelling}
        >
          {cancelling ? 'Cancelling…' : 'Cancel booking'}
        </Button>
      )}
      </div>

      {pendingRatingId === bookingId && (
        <RatingModal
          bookingId={bookingId}
          open
          accent="primary"
          onDone={() => setPendingRatingId(null)}
        />
      )}
    </div>
  );
}
