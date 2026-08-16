'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { useBookingSocket } from '@/lib/useBookingSocket';
import { useLiveLocationBroadcast } from '@/lib/useLiveLocationBroadcast';
import { Booking } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/worker/StatusPill';
import { ChatPanel } from '@/components/worker/ChatPanel';
import { RatingModal } from '@/components/worker/RatingModal';
import { PhotoProofCapture } from '@/components/worker/PhotoProofCapture';
import { BackHeader } from '@/components/ui/BackHeader';
import { Avatar } from '@/components/ui/Avatar';
import { MapPinIcon, CheckIcon, StarIcon, MessageIcon } from '@/components/ui/icons';

// Raw phone numbers are never sent to the client (no telephony/SMS-masking
// vendor is wired up — see the customer track page's identical comment) —
// this scrolls to the chat panel already on this screen instead of
// pretending to place a call.
function focusChat() {
  const input = document.getElementById('booking-chat-input');
  input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (input as HTMLInputElement | null)?.focus();
}

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

const STEPS: { status: Booking['status']; label: string }[] = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'in_progress', label: 'Working' },
  { status: 'completed', label: 'Done' },
];

export default function HamaliActiveJobPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showRating, setShowRating] = useState(false);

  const { data, reload } = usePolling(
    () => api.get<{ bookings: Booking[] }>('/api/requests/mine'),
    6000,
    [bookingId]
  );
  const booking = data?.bookings.find((b) => b._id === bookingId);
  const { messages, sendChat } = useBookingSocket(bookingId);
  useLiveLocationBroadcast(bookingId, booking?.status === 'in_progress');

  async function advance() {
    if (!booking) return;
    setPending(true);
    setError(null);
    try {
      const action = booking.status === 'accepted' ? 'start' : 'complete';
      await api.post(`/api/requests/${booking._id}/${action}`);
      if (action === 'complete') {
        setShowRating(true);
      } else {
        await reload();
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update this job.');
    } finally {
      setPending(false);
    }
  }

  if (!booking) {
    return (
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title="Active job" fallbackHref="/hamali/dashboard" />
        <p className="px-5 pt-6 text-sm text-text-muted">Loading job…</p>
      </div>
    );
  }

  const stepIndex = STEPS.findIndex((s) => s.status === booking.status);

  return (
    <div className="max-w-lg mx-auto pb-6">
      <BackHeader title="Active job" fallbackHref="/hamali/dashboard" />
      <RouteMap
        pickup={{ lat: booking.pickupLocation.coordinates[1], lng: booking.pickupLocation.coordinates[0] }}
        drop={{ lat: booking.dropLocation.coordinates[1], lng: booking.dropLocation.coordinates[0] }}
        className="h-56"
      />

      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-text-muted">Job status</p>
          <StatusPill status={booking.status} />
        </div>
        {booking.status === 'in_progress' && (
          <p className="flex items-center gap-1.5 text-xs text-text-muted mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Sharing your live location with the customer
          </p>
        )}
        {booking.status !== 'in_progress' && <div className="mb-5" />}

        <div className="flex items-center mb-6">
          {STEPS.map((step, i) => (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-base ${
                    i <= stepIndex ? 'bg-secondary-600 text-white' : 'bg-surface text-text-muted'
                  }`}
                >
                  {i < stepIndex ? <CheckIcon className="w-4 h-4" /> : i + 1}
                </span>
                <span className="text-[11px] text-text-muted whitespace-nowrap">{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1.5 -mt-4 transition-colors duration-base ${i < stepIndex ? 'bg-secondary-600' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {booking.customer && (
          <div className="flex items-center gap-3 p-3.5 rounded-lg bg-surface-raised border border-border shadow-sm mb-5">
            <Avatar name={booking.customer.name} photoUrl={booking.customer.profilePhoto} accent="secondary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">{booking.customer.name}</p>
              <span className="inline-flex items-center gap-0.5">
                <StarIcon className="w-3.5 h-3.5 text-secondary-600" fill="currentColor" />
                <span className="text-[11px] text-text-muted ml-0.5">
                  {booking.customer.ratingCount > 0 ? `${booking.customer.ratingAvg.toFixed(1)} (${booking.customer.ratingCount})` : 'New'}
                </span>
              </span>
            </div>
            <button
              type="button"
              onClick={focusChat}
              aria-label="Message customer"
              className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center flex-shrink-0 hover:bg-secondary/15 transition-colors duration-fast"
            >
              <MessageIcon className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-2.5">
            <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-secondary-600" />
            <p className="text-sm">{booking.pickupLocation.address}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-muted" />
            <p className="text-sm text-text-muted">{booking.dropLocation.address}</p>
          </div>
        </div>

        <div className="mb-6">
          <ChatPanel messages={messages} currentUserId={user?._id} onSend={sendChat} accent="secondary" />
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {(booking.status === 'accepted' || booking.status === 'in_progress') && (
          <PhotoProofCapture
            bookingId={booking._id}
            stage={booking.status === 'accepted' ? 'pickup' : 'delivery'}
            existingUrl={booking.status === 'accepted' ? booking.proofPhotos?.pickup : booking.proofPhotos?.delivery}
            onUploaded={() => reload()}
            accent="secondary"
          />
        )}

        {booking.status !== 'completed' && (
          <>
            {!pending &&
              (booking.status === 'accepted' ? !booking.proofPhotos?.pickup : !booking.proofPhotos?.delivery) && (
                <p className="text-xs text-text-muted text-center mb-2">
                  Take a {booking.status === 'accepted' ? 'pickup' : 'delivery'} photo above to continue.
                </p>
              )}
            <Button
              variant="secondary"
              className="w-full"
              size="lg"
              disabled={pending || (booking.status === 'accepted' ? !booking.proofPhotos?.pickup : !booking.proofPhotos?.delivery)}
              onClick={advance}
            >
              {pending ? 'Updating…' : booking.status === 'accepted' ? 'Start job' : 'Mark done'}
            </Button>
          </>
        )}
      </div>

      <RatingModal
        bookingId={booking._id}
        open={showRating}
        accent="secondary"
        title="Rate the customer"
        onDone={() => router.push('/hamali/dashboard')}
      />
    </div>
  );
}
