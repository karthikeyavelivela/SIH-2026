'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useIncomingOffer } from '@/lib/useIncomingOffer';
import { Booking, MuthaResponse } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { OfferCard } from '@/components/worker/OfferCard';
import { SelectableWorkerCard } from '@/components/ui/SelectableWorkerCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LayersIcon, MapPinIcon, AlertIcon } from '@/components/ui/icons';

function MemberPicker({
  booking,
  members,
  onAssigned,
}: {
  booking: Booking;
  members: MuthaResponse['members'];
  onAssigned: () => void;
}) {
  const t = useTranslations('muthaRequests');
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
      setError(err instanceof ApiClientError ? err.message : t('errorAssign'));
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
    <div className="ip-card animate-[scaleIn_250ms_ease-out]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-full bg-ip-secondary-container/30 text-ip-secondary flex items-center justify-center flex-shrink-0">
            <LayersIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-heading font-bold text-base capitalize">{t('jobLabel', { type: booking.type })}</p>
            <p className="text-xs text-ip-on-surface-variant">
              {t('needsMore', { count: remaining, plural: remaining === 1 ? '' : 's' })}
            </p>
          </div>
        </div>
        <p className="font-heading font-bold text-lg whitespace-nowrap">₹{booking.fareBreakdown.total}</p>
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

      <p className="text-xs font-semibold text-ip-on-surface-variant uppercase tracking-wide mb-2">
        {t('assignOnline', { selected: selected.length, remaining })}
      </p>
      {onlineMembers.length === 0 ? (
        <p className="text-sm text-ip-on-surface-variant mb-4">{t('noneOnline')}</p>
      ) : (
        <div className="space-y-1 mb-4">
          {onlineMembers.map((m) => {
            const checked = selected.includes(m._id);
            return (
              <SelectableWorkerCard
                key={m._id}
                name={m.name}
                photoUrl={m.profilePhoto}
                subtitle={t('currentlyActive')}
                selected={checked}
                disabled={!checked && selected.length >= remaining}
                onToggle={() => toggle(m._id)}
              />
            );
          })}
        </div>
      )}

      {error && (
        <div role="alert" className="mb-4 rounded-ip-input border border-ip-error/30 bg-ip-error-container/40 px-4 py-3 text-sm text-ip-on-error-container">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" disabled={pending} onClick={reject}>
          {t('reject')}
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          disabled={pending || selected.length !== remaining}
          onClick={assign}
        >
          {pending ? t('assigning') : t('assign', { count: selected.length || '' })}
        </Button>
      </div>
    </div>
  );
}

export default function MuthaRequestsPage() {
  const t = useTranslations('muthaRequests');
  const { data: requestsData, state, reload: reloadRequests } = usePolling(
    () => api.get<{ requests: Booking[] }>('/api/requests'),
    6000
  );
  const { data: muthaData, reload: reloadMutha } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 6000);
  const { offer, responding, respond } = useIncomingOffer();
  const [offerError, setOfferError] = useState<string | null>(null);

  async function onAssigned() {
    await Promise.all([reloadRequests(), reloadMutha()]);
  }

  async function respondToOffer(accept: boolean) {
    setOfferError(null);
    const ack = await respond(accept);
    if (!ack.ok && ack.error) setOfferError(ack.error);
    await reloadRequests();
  }

  const requests = requestsData?.requests ?? [];
  const members = muthaData?.members ?? [];

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-1">{t('pageTitle')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-6">{t('pageSubtitle')}</p>

      {offer && (
        <div className="mb-6">
          <OfferCard
            offer={offer}
            accent="secondary"
            responding={responding}
            acceptLabel={t('acceptAndAssign')}
            onAccept={() => respondToOffer(true)}
            onReject={() => respondToOffer(false)}
          />
          <p className="text-xs text-ip-on-surface-variant mt-2">{t('holdNotice')}</p>
          {offerError && (
            <div role="alert" className="flex items-start gap-2 mt-2 rounded-ip-input border border-ip-error/30 bg-ip-error-container/40 px-3.5 py-2.5 text-xs text-ip-on-error-container">
              <AlertIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p>{offerError}</p>
            </div>
          )}
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-56 rounded-ip-card bg-ip-surface-container animate-pulse" />
          ))}
        </div>
      )}

      {state !== 'loading' && requests.length === 0 && (
        <EmptyState icon={<LayersIcon className="w-6 h-6" />} title={t('noOpenRequests')} description={t('noOpenRequestsDesc')} />
      )}

      <div className="space-y-4">
        {requests.map((b) => (
          <MemberPicker key={b._id} booking={b} members={members} onAssigned={onAssigned} />
        ))}
      </div>
    </div>
  );
}
