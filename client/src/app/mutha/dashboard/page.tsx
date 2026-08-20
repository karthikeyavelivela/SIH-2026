'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking, EarningsResponse, MuthaResponse } from '@/lib/types';
import { RatingModal } from '@/components/worker/RatingModal';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { AvatarStack } from '@/components/ui/AvatarStack';
import { MetricCard } from '@/components/ui/MetricCard';
import { CrewAttendanceCard } from '@/components/ui/CrewAttendanceCard';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListDivider } from '@/components/ui/ListDivider';
import { StarIcon, UsersIcon, ChevronRightIcon, TruckIcon, WalletIcon, LayersIcon, CompassIcon } from '@/components/ui/icons';

const crewStatus: Record<string, 'on_job' | 'available' | 'offline'> = {
  online: 'available',
  on_job: 'on_job',
  offline: 'offline',
};

export default function MuthaDashboardPage() {
  const { user } = useAuth();
  const { data, state } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);
  const { data: bookingsData } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 15000);
  const { data: earningsData } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);
  const [pendingRatingId, setPendingRatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => {});
  }, []);

  const onlineCount = data?.members.filter((m) => m.availabilityStatus === 'online').length ?? 0;
  const activeJobs = (bookingsData?.bookings ?? []).filter((b) => b.status === 'accepted' || b.status === 'in_progress');
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <p className="text-xs text-ip-on-surface-variant">Hello,</p>
      <h1 className="font-heading text-2xl font-bold mb-6">{firstName} 👋</h1>

      <NotificationPrompt accent="secondary" copy="Get notified the instant a new job request arrives." />

      {state === 'loading' && <div className="h-40 rounded-ip-card bg-ip-surface-container animate-pulse mb-6" />}

      {data && (
        <div className="ip-card mb-6">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="min-w-0">
              <p className="font-heading text-xl font-bold truncate">{data.mutha.name}</p>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-ip-secondary mt-1">
                <StarIcon className="w-3.5 h-3.5" />
                {data.mutha.ratingCount > 0 ? `${data.mutha.ratingAvg.toFixed(1)} (${data.mutha.ratingCount})` : 'New group'}
              </span>
            </div>
            {data.members.length > 0 && <AvatarStack people={data.members.map((m) => ({ name: m.name, photoUrl: m.profilePhoto }))} />}
          </div>
          <ListDivider className="my-3" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-ip-on-surface-variant mb-0.5">Invite code</p>
              <p className="font-heading text-base font-bold tracking-[0.15em]">{data.mutha.inviteCode}</p>
            </div>
            <Link
              href="/mutha/create-group"
              className="inline-flex items-center gap-1 text-xs font-semibold text-ip-secondary hover:underline flex-shrink-0"
            >
              Group settings
              <ChevronRightIcon className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2.5 mb-6">
        <MetricCard label="Members" value={data?.members.length ?? 0} icon={<UsersIcon className="w-4 h-4" />} />
        <MetricCard label="Online" value={onlineCount} icon={<CompassIcon className="w-4 h-4" />} />
        <MetricCard label="Active jobs" value={activeJobs.length} icon={<TruckIcon className="w-4 h-4" />} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-bold">Active jobs</h2>
        <Link href="/mutha/active-jobs" className="text-xs font-semibold text-ip-secondary hover:underline">
          View all
        </Link>
      </div>
      {activeJobs.length === 0 ? (
        <div className="ip-card mb-6">
          <EmptyState icon={<TruckIcon className="w-6 h-6" />} title="No active jobs" description="Accept a request to put your crew to work." />
        </div>
      ) : (
        <div className="ip-card mb-6 divide-y divide-ip-outline/10">
          {activeJobs.slice(0, 3).map((b) => (
            <div key={b._id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate capitalize">{b.type} job</p>
                <p className="text-xs text-ip-on-surface-variant truncate">{b.pickupLocation.address}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <StatusChip tone={b.status === 'in_progress' ? 'primary' : 'secondary'}>
                  {b.status === 'in_progress' ? 'Working' : 'Accepted'}
                </StatusChip>
                <Link
                  href={`/mutha/assign-members?bookingId=${b._id}`}
                  className="text-xs font-semibold text-ip-secondary hover:underline whitespace-nowrap"
                >
                  Crew
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-heading text-lg font-bold mb-3">Roster</h2>
      <div className="ip-card mb-6">
        {data?.members.length === 0 && (
          <EmptyState icon={<UsersIcon className="w-6 h-6" />} title="No members yet" description="Share your invite code above." />
        )}
        {data?.members.map((m, i) => (
          <div key={m._id}>
            {i > 0 && <ListDivider />}
            <CrewAttendanceCard name={m.name} photoUrl={m.profilePhoto} status={crewStatus[m.availabilityStatus]} />
          </div>
        ))}
      </div>

      <div className="ip-card mb-6 divide-y divide-ip-outline/10">
        <Link href="/mutha/requests" className="flex items-center justify-between py-3 first:pt-0">
          <span className="flex items-center gap-2.5 text-sm font-semibold">
            <LayersIcon className="w-4 h-4 text-ip-outline" />
            View open job requests
          </span>
          <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
        </Link>
        <Link href="/mutha/operations" className="flex items-center justify-between py-3">
          <span className="flex items-center gap-2.5 text-sm font-semibold">
            <CompassIcon className="w-4 h-4 text-ip-outline" />
            Crew operations
          </span>
          <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
        </Link>
        <Link href="/mutha/earnings" className="flex items-center justify-between py-3 last:pb-0">
          <span className="flex items-center gap-2.5 text-sm font-semibold">
            <WalletIcon className="w-4 h-4 text-ip-outline" />
            Group earnings — ₹{earningsData?.total ?? 0} to date
          </span>
          <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
        </Link>
      </div>

      {pendingRatingId && (
        <RatingModal
          bookingId={pendingRatingId}
          open
          accent="secondary"
          title="Rate your last customer"
          onDone={() => setPendingRatingId(null)}
        />
      )}
    </div>
  );
}
