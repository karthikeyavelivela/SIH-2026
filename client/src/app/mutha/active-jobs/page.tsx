'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { TruckIcon, MapPinIcon, UsersIcon } from '@/components/ui/icons';

function JobRow({ booking, onChanged }: { booking: Booking; onChanged: () => Promise<void> }) {
  const t = useTranslations('muthaActiveJobs');
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
      setError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fy-surface-card">
      <div className="flex items-center justify-between mb-3">
        <StatusChip tone={booking.status === 'in_progress' ? 'primary' : 'secondary'}>
          {booking.status === 'in_progress' ? t('working') : t('accepted')}
        </StatusChip>
        <p className="font-heading font-bold">₹{booking.fareBreakdown.total}</p>
      </div>
      <div className="space-y-2 mb-4">
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-fy-green" />
          <p className="text-sm truncate">{booking.pickupLocation.address}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-fy-ink-soft" />
          <p className="text-sm text-fy-ink-soft truncate">{booking.dropLocation.address}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-fy-ink-soft">
          {t('membersAssigned', { assigned: booking.assignedHamaliIds.length, required: booking.requiredHamaliCount })}
        </p>
        <Link
          href={`/mutha/assign-members?bookingId=${booking._id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-fy-green hover:underline"
        >
          <UsersIcon className="w-3.5 h-3.5" />
          {t('manageCrew')}
        </Link>
      </div>
      {error && <p className="text-xs text-fy-error mb-3">{error}</p>}
      {booking.status !== 'completed' && (
        <Button variant="secondary" size="md" disabled={pending} onClick={advance} className="w-full">
          {pending ? t('updating') : booking.status === 'accepted' ? t('startJob') : t('markComplete')}
        </Button>
      )}
    </div>
  );
}

export default function MuthaActiveJobsPage() {
  const t = useTranslations('muthaActiveJobs');
  const { data, state, reload } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 8000);
  const jobs = (data?.bookings ?? []).filter((b) => b.status === 'accepted' || b.status === 'in_progress');

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-1">{t('pageTitle')}</h1>
      <p className="text-sm text-fy-ink-soft mb-6">{t('pageSubtitle')}</p>

      {state === 'loading' && <div className="h-40 rounded-card bg-fy-field animate-pulse" />}

      {state !== 'loading' && jobs.length === 0 && (
        <EmptyState icon={<TruckIcon className="w-6 h-6" />} title={t('noActiveJobs')} description={t('noActiveJobsDesc')} />
      )}

      <div className="space-y-4">
        {jobs.map((b) => (
          <JobRow key={b._id} booking={b} onChanged={async () => { await reload(); }} />
        ))}
      </div>
    </div>
  );
}
