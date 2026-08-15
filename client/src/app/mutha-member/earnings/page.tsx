'use client';

import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { EarningsResponse } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { WalletIcon } from '@/components/ui/icons';

export default function MuthaMemberEarningsPage() {
  const { data, state } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Earnings</h1>

      <div className="rounded-lg bg-secondary-600 text-white p-6 shadow-lg mb-6">
        <p className="text-sm text-white/80 mb-1">Total earned</p>
        <p className="font-heading text-3xl font-extrabold">₹{data?.total ?? 0}</p>
        <p className="text-sm text-white/80 mt-1">{data?.jobCount ?? 0} completed jobs</p>
      </div>

      <h2 className="font-heading text-lg font-bold mb-3">History</h2>
      {state === 'loading' && <div className="h-24 rounded-lg bg-surface animate-pulse" />}

      {state !== 'loading' && (data?.lines.length ?? 0) === 0 && (
        <Card elevation="raised" className="text-center py-10">
          <WalletIcon className="w-8 h-8 text-text-muted/50 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No completed jobs yet.</p>
        </Card>
      )}

      <div className="space-y-3">
        {data?.lines.map((line) => (
          <Card key={line.bookingId} elevation="raised" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{line.dropAddress}</p>
              <p className="text-xs text-text-muted">
                {line.completedAt ? new Date(line.completedAt).toLocaleDateString() : ''}
              </p>
            </div>
            <p className="font-heading font-bold whitespace-nowrap">₹{line.amount}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
