'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking, EarningsResponse, MuthaResponse } from '@/lib/types';
import { BackHeader } from '@/components/ui/BackHeader';
import { MetricCard } from '@/components/ui/MetricCard';
import { CrewAttendanceCard } from '@/components/ui/CrewAttendanceCard';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListDivider } from '@/components/ui/ListDivider';
import { TruckIcon, UsersIcon, WalletIcon } from '@/components/ui/icons';

export default function MuthaOperationsPage() {
  const { data: bookingsData, state } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 8000);
  const { data: muthaData } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);
  const { data: earningsData } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  const activeJobs = (bookingsData?.bookings ?? []).filter((b) => b.status === 'accepted' || b.status === 'in_progress');
  const membersById = new Map((muthaData?.members ?? []).map((m) => [m._id, m]));
  const totalDeployed = activeJobs.reduce((sum, b) => sum + b.assignedHamaliIds.length, 0);

  return (
    <div className="max-w-lg mx-auto pb-6">
      <BackHeader title="Operations" fallbackHref="/mutha/dashboard" />

      <div className="px-5 pt-5">
        <p className="text-sm text-ip-on-surface-variant mb-5">
          Crew deployments across every job your group is currently running.
        </p>

        <div className="grid grid-cols-3 gap-2.5 mb-6">
          <MetricCard label="Active jobs" value={activeJobs.length} icon={<TruckIcon className="w-4 h-4" />} />
          <MetricCard label="Deployed" value={totalDeployed} icon={<UsersIcon className="w-4 h-4" />} />
          <MetricCard label="Earned" value={`₹${earningsData?.total ?? 0}`} icon={<WalletIcon className="w-4 h-4" />} />
        </div>

        <h2 className="font-heading text-lg font-bold mb-3">Active deployments</h2>

        {state === 'loading' && <div className="h-40 rounded-ip-card bg-ip-surface-container animate-pulse" />}

        {state !== 'loading' && activeJobs.length === 0 && (
          <div className="ip-card">
            <EmptyState icon={<TruckIcon className="w-6 h-6" />} title="No active deployments" description="Accepted jobs and their crews will show up here." />
          </div>
        )}

        <div className="space-y-4">
          {activeJobs.map((b) => {
            const assigned = b.assignedHamaliIds.map((id) => membersById.get(id)).filter(Boolean) as NonNullable<
              ReturnType<typeof membersById.get>
            >[];
            return (
              <div key={b._id} className="ip-card">
                <div className="flex items-start justify-between gap-3 mb-1">
                  <p className="font-heading font-bold capitalize">{b.type} job</p>
                  <StatusChip tone={b.status === 'in_progress' ? 'primary' : 'secondary'}>
                    {b.status === 'in_progress' ? 'Working' : 'Accepted'}
                  </StatusChip>
                </div>
                <p className="text-xs text-ip-on-surface-variant truncate mb-3">{b.pickupLocation.address}</p>
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">
                  <span>
                    {b.assignedHamaliIds.length}/{b.requiredHamaliCount} assigned
                  </span>
                  <Link href={`/mutha/assign-members?bookingId=${b._id}`} className="text-ip-secondary normal-case font-semibold hover:underline">
                    Manage crew
                  </Link>
                </div>
                {assigned.length > 0 && (
                  <>
                    <ListDivider className="mb-1" />
                    {assigned.map((m, i) => (
                      <div key={m._id}>
                        {i > 0 && <ListDivider />}
                        <CrewAttendanceCard name={m.name} photoUrl={m.profilePhoto} status="on_job" />
                      </div>
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
