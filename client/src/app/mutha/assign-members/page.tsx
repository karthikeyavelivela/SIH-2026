'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking, MuthaResponse } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { BackHeader } from '@/components/ui/BackHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { SelectableWorkerCard } from '@/components/ui/SelectableWorkerCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { MapPinIcon, UsersIcon } from '@/components/ui/icons';

export default function AssignMembersPage() {
  return (
    <Suspense fallback={null}>
      <AssignMembersInner />
    </Suspense>
  );
}

function AssignMembersInner() {
  const params = useSearchParams();
  const router = useRouter();
  const bookingId = params.get('bookingId');

  const { data: bookingsData, reload: reloadBookings } = usePolling(
    () => api.get<{ bookings: Booking[] }>('/api/requests/mine'),
    8000
  );
  const { data: muthaData } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);

  const booking = bookingsData?.bookings.find((b) => b._id === bookingId);
  const currentIds = useMemo(() => new Set(booking?.assignedHamaliIds ?? []), [booking]);

  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed the checklist from the booking's current crew the first time it
  // loads — after that, `selected` is purely local toggle state until submit.
  const activeSelection = selected ?? currentIds;

  const required = booking?.requiredHamaliCount ?? 0;
  const candidates = (muthaData?.members ?? []).filter(
    (m) => m.availabilityStatus === 'online' || currentIds.has(m._id)
  );

  function toggle(id: string) {
    const next = new Set(activeSelection);
    if (next.has(id)) {
      next.delete(id);
    } else if (next.size < required) {
      next.add(id);
    }
    setSelected(next);
  }

  async function submit() {
    if (!booking) return;
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/mutha/jobs/${booking._id}/assign`, { memberIds: [...activeSelection] });
      await reloadBookings();
      router.push('/mutha/active-jobs');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update the crew for this job.');
    } finally {
      setPending(false);
    }
  }

  if (!bookingId) {
    return (
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title="Assign crew" fallbackHref="/mutha/active-jobs" />
        <EmptyState
          className="mt-4"
          icon={<UsersIcon className="w-6 h-6" />}
          title="No job selected"
          description="Open a job from Active jobs to manage its crew."
        />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="max-w-lg mx-auto pb-6">
        <BackHeader title="Assign crew" fallbackHref="/mutha/active-jobs" />
        <p className="px-5 pt-6 text-sm text-ip-on-surface-variant">Loading job…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-6">
      <BackHeader title="Assign crew" fallbackHref="/mutha/active-jobs" />

      <div className="px-5 pt-5">
        <div className="ip-card mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <p className="font-heading text-xl font-bold capitalize">{booking.type} job</p>
            <StatusChip tone={booking.status === 'in_progress' ? 'primary' : 'secondary'}>
              {booking.status === 'in_progress' ? 'Working' : 'Accepted'}
            </StatusChip>
          </div>
          <div className="flex items-start gap-2.5 mb-4">
            <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-ip-secondary" />
            <p className="text-sm">{booking.pickupLocation.address}</p>
          </div>
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant">
            <span>Workers needed: {required}</span>
            <span>Selected: {activeSelection.size}</span>
          </div>
        </div>

        <p className="text-xs font-semibold text-ip-on-surface-variant uppercase tracking-wide mb-2">
          Available members
        </p>
        {candidates.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="w-6 h-6" />}
            title="No members available"
            description="Bring a member online to assign them to this job."
          />
        ) : (
          <div className="ip-card mb-6 space-y-1">
            {candidates.map((m) => (
              <SelectableWorkerCard
                key={m._id}
                name={m.name}
                photoUrl={m.profilePhoto}
                subtitle={m.availabilityStatus === 'online' ? 'Currently active' : 'Assigned to this job'}
                selected={activeSelection.has(m._id)}
                disabled={!activeSelection.has(m._id) && activeSelection.size >= required}
                onToggle={() => toggle(m._id)}
              />
            ))}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded-ip-input border border-ip-error/30 bg-ip-error-container/40 px-4 py-3 text-sm text-ip-on-error-container">
            {error}
          </div>
        )}

        <Button
          variant="secondary"
          size="lg"
          className="w-full"
          disabled={pending || activeSelection.size === 0}
          onClick={submit}
        >
          {pending ? 'Assigning…' : `Assign & notify ${activeSelection.size || ''}`}
        </Button>
      </div>
    </div>
  );
}
