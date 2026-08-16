'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking, EarningsResponse } from '@/lib/types';
import { Avatar } from '@/components/ui/Avatar';
import { OnlineToggle } from '@/components/worker/OnlineToggle';
import { StatusPill } from '@/components/worker/StatusPill';
import { RatingModal } from '@/components/worker/RatingModal';
import { ServiceAreaCard } from '@/components/worker/ServiceAreaCard';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { HAMALI_WILLING_RADIUS_KM } from '@/lib/matchingConstants';
import { BoxIcon, WalletIcon, StarIcon, ChevronRightIcon, MapPinIcon } from '@/components/ui/icons';

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function HamaliDashboardPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'online' | 'offline' | 'on_job' | null>(null);
  const [willingLocation, setWillingLocation] = useState<{ lat: number; lng: number } | null | undefined>(undefined);
  const [pendingRatingId, setPendingRatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ availabilityStatus: 'online' | 'offline' | 'on_job'; willingLocation: { coordinates: [number, number] } | null }>(
        '/api/availability'
      )
      .then((res) => {
        setStatus(res.availabilityStatus);
        setWillingLocation(res.willingLocation?.coordinates ? { lat: res.willingLocation.coordinates[1], lng: res.willingLocation.coordinates[0] } : null);
      })
      .catch((err) => {
        if (err instanceof ApiClientError) {
          setStatus(null);
          setWillingLocation(null);
        }
      });
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => {});
  }, []);

  const { data: mine } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 8000);
  const activeJob = mine?.bookings.find((b) => b.status === 'accepted' || b.status === 'in_progress');
  const { data: earnings } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);
  const todayTotal =
    earnings?.lines
      .filter((l) => l.completedAt && new Date(l.completedAt).getTime() >= startOfToday())
      .reduce((sum, l) => sum + l.amount, 0) ?? 0;

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <div className="flex items-center gap-3.5 mb-6">
        <Avatar name={user?.name ?? '?'} photoUrl={user?.profilePhoto} accent="secondary" size="lg" status={status ?? undefined} />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-text-muted">Welcome back,</p>
          <h1 className="font-heading text-xl font-bold truncate">{firstName}</h1>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-semibold bg-secondary/10 text-secondary-600 px-2.5 py-1.5 rounded-full flex-shrink-0">
          <StarIcon className="w-3.5 h-3.5" fill="currentColor" />
          {user?.ratingCount ? user.ratingAvg?.toFixed(1) : 'New'}
        </span>
      </div>

      <NotificationPrompt accent="secondary" copy="Get notified the instant a new job request arrives." />

      {status !== null && (
        <div className="mb-5">
          <OnlineToggle status={status} onStatusChange={(s) => setStatus(s)} accent="secondary" />
        </div>
      )}

      <div className="rounded-lg bg-secondary-600 text-white p-6 shadow-lg mb-5">
        <p className="text-xs uppercase tracking-wide text-white/75 mb-1">Today&apos;s earnings</p>
        <p className="font-heading text-4xl font-extrabold tabular-nums">₹{todayTotal}</p>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/20 text-sm text-white/85">
          <p>
            <span className="font-heading font-bold text-white">{earnings?.jobCount ?? 0}</span> total jobs
          </p>
          <Link href="/hamali/earnings" className="ml-auto inline-flex items-center gap-1 text-sm font-semibold">
            Earnings <ChevronRightIcon className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {activeJob ? (
        <Link href={`/hamali/active-job/${activeJob._id}`} className="block mb-5">
          <div className="rounded-lg bg-surface-raised border border-border shadow-md p-5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-base">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Active job</span>
              <StatusPill status={activeJob.status} />
            </div>
            <div className="space-y-1.5 mb-3">
              <div className="flex items-start gap-2">
                <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-secondary-600" />
                <p className="text-sm truncate">{activeJob.pickupLocation.address}</p>
              </div>
              <div className="flex items-start gap-2">
                <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-text-muted" />
                <p className="text-sm text-text-muted truncate">{activeJob.dropLocation.address}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-secondary-600">
              View job <ChevronRightIcon className="w-4 h-4" />
            </span>
          </div>
        </Link>
      ) : (
        <div className="rounded-lg bg-surface-raised border border-border shadow-sm flex items-center gap-3 p-5 mb-5">
          <BoxIcon className="w-8 h-8 text-text-muted flex-shrink-0" />
          <p className="text-sm text-text-muted">No active job. Go online and check Requests for new jobs nearby.</p>
        </div>
      )}

      {willingLocation !== undefined && (
        <ServiceAreaCard initial={willingLocation} radiusKm={HAMALI_WILLING_RADIUS_KM} accent="secondary" />
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
