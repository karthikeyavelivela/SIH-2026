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
import { ChatPanel } from '@/components/worker/ChatPanel';
import { RatingModal } from '@/components/worker/RatingModal';
import { TruckIcon, BoxIcon, StarIcon, AlertIcon } from '@/components/ui/icons';

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

interface AssignedPerson {
  id: string;
  name: string;
  phone?: string;
  ratingAvg: number;
  ratingCount: number;
  vehicle?: { type: string; capacityKg: number; registrationNumber: string } | null;
}

function AssignedRow({ entry, sub }: { entry: AssignedPerson; sub?: 'vehicle' | 'group' }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div>
        <p className="text-sm font-semibold">{entry.name}</p>
        {sub === 'vehicle' && entry.vehicle && (
          <p className="text-xs text-text-muted">
            {entry.vehicle.type.replace('_', ' ')} · {entry.vehicle.registrationNumber}
          </p>
        )}
        {sub === 'group' && <p className="text-xs text-text-muted">Mutha group</p>}
      </div>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-muted">
        <StarIcon className="w-3.5 h-3.5" />
        {entry.ratingCount > 0 ? entry.ratingAvg.toFixed(1) : 'New'}
      </span>
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
      <div className="max-w-lg mx-auto px-5 pt-6">
        <Card elevation="raised" className="text-center py-10 text-sm text-text-muted">
          {error}
        </Card>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6 space-y-3">
        <div className="h-8 w-1/2 rounded bg-surface animate-pulse" />
        <div className="h-40 rounded-lg bg-surface animate-pulse" />
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
    <div className="max-w-lg mx-auto px-5 pt-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold">Track booking</h1>
        <Badge tone={statusTone[booking.status] ?? 'secondary'}>{booking.status.replace('_', ' ')}</Badge>
      </div>

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
        className="h-48 mb-6"
      />

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
