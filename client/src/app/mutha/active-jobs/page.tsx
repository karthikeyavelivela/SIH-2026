'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TruckIcon, MapPinIcon, UsersIcon } from '@/components/ui/icons';

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
    <div className="ip-card">
      <div className="flex items-center justify-between mb-3">
        <StatusChip tone={booking.status === 'in_progress' ? 'primary' : 'secondary'}>
          {booking.status === 'in_progress' ? 'Working' : 'Accepted'}
        </StatusChip>
        <p className="font-heading font-bold">₹{booking.fareBreakdown.total}</p>
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-ip-secondary" />
          <p className="text-sm truncate">{booking.pickupLocation.address}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-ip-on-surface-variant" />
          <p className="text-sm text-ip-on-surface-variant truncate">{booking.dropLocation.address}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-ip-on-surface-variant">
          {booking.assignedHamaliIds.length}/{booking.requiredHamaliCount} member(s) assigned
        </p>
        <Link
          href={`/mutha/assign-members?bookingId=${booking._id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-ip-secondary hover:underline"
        >
          <UsersIcon className="w-3.5 h-3.5" />
          Manage crew
        </Link>
      </div>
      {error && <p className="text-xs text-ip-error mb-3">{error}</p>}
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
      <p className="text-sm text-ip-on-surface-variant mb-6">Every job your group is currently running, at once if split across sites.</p>

      {state === 'loading' && <div className="h-40 rounded-ip-card bg-ip-surface-container animate-pulse" />}

      {state !== 'loading' && jobs.length === 0 && (
        <EmptyState icon={<TruckIcon className="w-6 h-6" />} title="No active jobs" description="Accepted jobs your group is working will show up here." />
      )}

      <div className="space-y-4">
        {jobs.map((b) => (
          <JobRow key={b._id} booking={b} onChanged={async () => { await reload(); }} />
        ))}
      </div>
    </div>
  );
}
