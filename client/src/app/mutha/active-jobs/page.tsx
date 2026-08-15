'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/worker/StatusPill';
import { TruckIcon, MapPinIcon } from '@/components/ui/icons';

function JobRow({ booking, onChanged }: { booking: Booking; onChanged: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advance() {
    setPending(true);
    setError(null);
    try {
      const action = booking.status === 'accepted' ? 'start' : 'complete';
      await api.post(`/api/requests/${booking._id}/${action}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update this job.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface-raised border border-border shadow-md p-5">
      <div className="flex items-center justify-between mb-3">
        <StatusPill status={booking.status} />
        <p className="font-heading font-bold">₹{booking.fareBreakdown.total}</p>
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-secondary-600" />
          <p className="text-sm truncate">{booking.pickupLocation.address}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-muted" />
          <p className="text-sm text-text-muted truncate">{booking.dropLocation.address}</p>
        </div>
      </div>
      <p className="text-xs text-text-muted mb-3">{booking.assignedHamaliIds.length} member(s) assigned</p>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
      {booking.status !== 'completed' && (
        <Button variant="secondary" size="md" disabled={pending} onClick={advance} className="w-full">
          {pending ? 'Updating…' : booking.status === 'accepted' ? 'Start job' : 'Mark complete'}
        </Button>
      )}
    </div>
  );
}

export default function MuthaActiveJobsPage() {
  const { data, state, reload } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 8000);
  const jobs = (data?.bookings ?? []).filter((b) => b.status === 'accepted' || b.status === 'in_progress');

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-1">Active jobs</h1>
      <p className="text-sm text-text-muted mb-6">Every job your group is currently running, at once if split across sites.</p>

      {state === 'loading' && <div className="h-40 rounded-lg bg-surface animate-pulse" />}

      {state !== 'loading' && jobs.length === 0 && (
        <div className="text-center py-16">
          <TruckIcon className="w-10 h-10 text-text-muted/50 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No active jobs right now.</p>
        </div>
      )}

      <div className="space-y-4">
        {jobs.map((b) => (
          <JobRow key={b._id} booking={b} onChanged={async () => { await reload(); }} />
        ))}
      </div>
    </div>
  );
}
