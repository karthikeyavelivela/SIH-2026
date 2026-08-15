'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking, MuthaResponse } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { LayersIcon, MapPinIcon } from '@/components/ui/icons';

function MemberPicker({
  booking,
  members,
  onAssigned,
}: {
  booking: Booking;
  members: MuthaResponse['members'];
  onAssigned: () => void;
}) {
  const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
  const onlineMembers = members.filter((m) => m.availabilityStatus === 'online');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < remaining ? [...prev, id] : prev
    );
  }

  async function assign() {
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/requests/${booking._id}/accept`, { memberIds: selected });
      onAssigned();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not assign members to this job.');
    } finally {
      setPending(false);
    }
  }

  async function reject() {
    setPending(true);
    try {
      await api.post(`/api/requests/${booking._id}/reject`);
      onAssigned();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface-raised border border-border shadow-md p-5 animate-[scaleIn_250ms_ease-out]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center flex-shrink-0">
            <LayersIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-heading font-bold text-base capitalize">{booking.type} job</p>
            <p className="text-xs text-text-muted">Needs {remaining} more worker{remaining === 1 ? '' : 's'}</p>
          </div>
        </div>
        <p className="font-heading font-bold text-lg whitespace-nowrap">₹{booking.fareBreakdown.total}</p>
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

      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
        Assign online members ({selected.length}/{remaining})
      </p>
      {onlineMembers.length === 0 ? (
        <p className="text-sm text-text-muted mb-4">No members online right now — bring someone online to assign this job.</p>
      ) : (
        <div className="space-y-2 mb-4">
          {onlineMembers.map((m) => {
            const checked = selected.includes(m._id);
            return (
              <button
                key={m._id}
                type="button"
                onClick={() => toggle(m._id)}
                disabled={!checked && selected.length >= remaining}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md border text-sm font-medium transition-colors duration-fast disabled:opacity-40 ${
                  checked ? 'bg-secondary-600 text-white border-secondary-600' : 'bg-background border-border hover:bg-surface'
                }`}
              >
                {m.name}
                {checked && <span aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" disabled={pending} onClick={reject}>
          Reject
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          disabled={pending || selected.length !== remaining}
          onClick={assign}
        >
          {pending ? 'Assigning…' : `Assign ${selected.length || ''}`}
        </Button>
      </div>
    </div>
  );
}

export default function MuthaRequestsPage() {
  const { data: requestsData, state, reload: reloadRequests } = usePolling(
    () => api.get<{ requests: Booking[] }>('/api/requests'),
    6000
  );
  const { data: muthaData, reload: reloadMutha } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 6000);

  async function onAssigned() {
    await Promise.all([reloadRequests(), reloadMutha()]);
  }

  const requests = requestsData?.requests ?? [];
  const members = muthaData?.members ?? [];

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-1">Job requests</h1>
      <p className="text-sm text-text-muted mb-6">Assign specific online members to each job.</p>

      {state === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-56 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {state !== 'loading' && requests.length === 0 && (
        <div className="text-center py-16">
          <LayersIcon className="w-10 h-10 text-text-muted/50 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No open requests match your group right now.</p>
        </div>
      )}

      <div className="space-y-4">
        {requests.map((b) => (
          <MemberPicker key={b._id} booking={b} members={members} onAssigned={onAssigned} />
        ))}
      </div>
    </div>
  );
}
