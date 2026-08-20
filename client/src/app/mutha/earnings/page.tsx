'use client';

import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { EarningsResponse } from '@/lib/types';
import { EarningLineCard } from '@/components/worker/EarningLineCard';
import { IncentiveProgressBar } from '@/components/worker/IncentiveProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { WalletIcon, StarIcon } from '@/components/ui/icons';

export default function MuthaEarningsPage() {
  const { data, state } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Group earnings</h1>

      <div className="rounded-lg bg-secondary-600 text-white p-6 shadow-lg mb-6">
        <p className="text-sm text-white/80 mb-1">Group total</p>
        <p className="font-heading text-3xl font-extrabold">₹{data?.total ?? 0}</p>
        <p className="text-sm text-white/80 mt-1">{data?.jobCount ?? 0} completed jobs</p>
      </div>

      {!!data?.incentiveTotal && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-md bg-secondary/10 text-sm text-secondary-600">
          <StarIcon className="w-4 h-4 flex-shrink-0" />
          ₹{data.incentiveTotal} in group rating-based bonuses earned
        </div>
      )}

      <IncentiveProgressBar accent="secondary" />

      <h2 className="font-heading text-lg font-bold mb-3">Per member</h2>
      {state === 'loading' && <div className="h-24 rounded-ip-card bg-ip-surface-container animate-pulse mb-6" />}

      {state !== 'loading' && (data?.perMember?.length ?? 0) === 0 && (
        <div className="ip-card mb-6">
          <EmptyState icon={<WalletIcon className="w-6 h-6" />} title="No completed jobs yet" />
        </div>
      )}

      <div className="space-y-3 mb-8">
        {data?.perMember?.map((m) => (
          <div key={m.userId} className="ip-card flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{m.name}</p>
              <p className="text-xs text-ip-on-surface-variant">{m.phone}</p>
            </div>
            <p className="font-heading font-bold whitespace-nowrap">₹{m.total}</p>
          </div>
        ))}
      </div>

      <h2 className="font-heading text-lg font-bold mb-3">Order history</h2>
      <div className="space-y-3">
        {data?.lines.map((line) => (
          <EarningLineCard key={line.bookingId} line={line} />
        ))}
      </div>
    </div>
  );
}
