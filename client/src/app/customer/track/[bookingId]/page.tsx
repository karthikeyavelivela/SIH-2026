'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TruckIcon, BoxIcon } from '@/components/ui/icons';

interface BookingDetail {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  fareBreakdown: { baseFare: number; distanceFare: number; hamaliFare: number; total: number };
  pickupLocation: { address: string };
  dropLocation: { address: string };
  statusHistory: { status: string; timestamp: string }[];
}

const STEPS = ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed'];

const statusTone: Record<string, 'success' | 'secondary' | 'muted' | 'danger'> = {
  completed: 'success',
  cancelled: 'danger',
};

export default function TrackBookingPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-2xl font-bold">Track booking</h1>
        <Badge tone={statusTone[booking.status] ?? 'secondary'}>{booking.status.replace('_', ' ')}</Badge>
      </div>

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
    </div>
  );
}
