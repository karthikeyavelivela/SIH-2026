'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { OnlineToggle } from '@/components/worker/OnlineToggle';
import { StatusPill } from '@/components/worker/StatusPill';
import { BoxIcon, WalletIcon, ChevronRightIcon } from '@/components/ui/icons';

export default function HamaliDashboardPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'online' | 'offline' | 'on_job' | null>(null);

  useEffect(() => {
    api
      .get<{ availabilityStatus: 'online' | 'offline' | 'on_job' }>('/api/availability')
      .then((res) => setStatus(res.availabilityStatus))
      .catch((err) => {
        if (err instanceof ApiClientError) setStatus(null);
      });
  }, []);

  const { data: mine } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 8000);
  const activeJob = mine?.bookings.find((b) => b.status === 'accepted' || b.status === 'in_progress');

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <p className="text-xs text-text-muted">Hello,</p>
      <h1 className="font-heading text-2xl font-bold mb-6">{firstName} 👋</h1>

      {status !== null && (
        <div className="mb-6">
          <OnlineToggle status={status} onStatusChange={(s) => setStatus(s)} accent="secondary" />
        </div>
      )}

      {activeJob ? (
        <Link href={`/hamali/active-job/${activeJob._id}`} className="block mb-6">
          <div className="rounded-lg bg-secondary-600 text-white p-5 shadow-lg hover:shadow-glow-secondary hover:-translate-y-0.5 transition-all duration-base">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/80">Active job</span>
              <StatusPill status={activeJob.status} />
            </div>
            <p className="font-heading font-bold text-lg mb-1">{activeJob.dropLocation.address}</p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              View job <ChevronRightIcon className="w-4 h-4" />
            </span>
          </div>
        </Link>
      ) : (
        <Card elevation="flat" className="flex items-center gap-3 mb-6">
          <BoxIcon className="w-8 h-8 text-text-muted flex-shrink-0" />
          <p className="text-sm text-text-muted">No active job. Go online and check Requests for new jobs nearby.</p>
        </Card>
      )}

      <Link href="/hamali/earnings" className="flex items-center justify-between p-4 rounded-lg bg-surface-raised border border-border shadow-sm hover:shadow-md transition-all duration-base">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center">
            <WalletIcon className="w-5 h-5" />
          </span>
          <p className="text-sm font-semibold">View earnings</p>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
      </Link>
    </div>
  );
}
