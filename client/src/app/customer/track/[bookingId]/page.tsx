'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TruckIcon, BoxIcon } from '@/components/ui/icons';

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

export default function TrackBookingPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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
    // Poll every 5s for status updates (Phase 2 is polling-based; live
    // socket push is Phase 3).
    const interval = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bookingId]);

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

      <RouteMap pickup={{ lat: pLat, lng: pLng }} drop={{ lat: dLat, lng: dLng }} className="h-48 mb-6" />

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
  );
}
