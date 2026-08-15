'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import dynamic from 'next/dynamic';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/worker/StatusPill';
import { MapPinIcon, CheckIcon } from '@/components/ui/icons';

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

const STEPS: { status: Booking['status']; label: string }[] = [
  { status: 'accepted', label: 'Accepted' },
  { status: 'in_progress', label: 'In transit' },
  { status: 'completed', label: 'Delivered' },
];

export default function DriverActiveJobPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { data, reload } = usePolling(
    () => api.get<{ bookings: Booking[] }>('/api/requests/mine'),
    6000,
    [bookingId]
  );
  const booking = data?.bookings.find((b) => b._id === bookingId);

  async function advance() {
    if (!booking) return;
    setPending(true);
    setError(null);
    try {
      const action = booking.status === 'accepted' ? 'start' : 'complete';
      await api.post(`/api/requests/${booking._id}/${action}`);
      if (action === 'complete') {
        router.push('/driver/dashboard');
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
    return <div className="max-w-lg mx-auto px-5 pt-6 text-sm text-text-muted">Loading job…</div>;
  }

  const stepIndex = STEPS.findIndex((s) => s.status === booking.status);

  return (
    <div className="max-w-lg mx-auto pb-6">
      <RouteMap
        pickup={{ lat: booking.pickupLocation.coordinates[1], lng: booking.pickupLocation.coordinates[0] }}
        drop={{ lat: booking.dropLocation.coordinates[1], lng: booking.dropLocation.coordinates[0] }}
        className="h-56"
      />

      <div className="px-5 pt-5">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-heading text-xl font-bold">Active job</h1>
          <StatusPill status={booking.status} />
        </div>

        {/* Status stepper */}
        <div className="flex items-center mb-6">
          {STEPS.map((step, i) => (
            <div key={step.status} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors duration-base ${
                    i <= stepIndex ? 'bg-primary-600 text-white' : 'bg-surface text-text-muted'
                  }`}
                >
                  {i < stepIndex ? <CheckIcon className="w-4 h-4" /> : i + 1}
                </span>
                <span className="text-[11px] text-text-muted whitespace-nowrap">{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-1.5 -mt-4 transition-colors duration-base ${i < stepIndex ? 'bg-primary-600' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex items-start gap-2.5">
            <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-primary-600" />
            <p className="text-sm">{booking.pickupLocation.address}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-muted" />
            <p className="text-sm text-text-muted">{booking.dropLocation.address}</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {booking.status !== 'completed' && (
          <Button className="w-full" size="lg" disabled={pending} onClick={advance}>
            {pending ? 'Updating…' : booking.status === 'accepted' ? 'Start trip' : 'Mark delivered'}
          </Button>
        )}
      </div>
    </div>
  );
}
