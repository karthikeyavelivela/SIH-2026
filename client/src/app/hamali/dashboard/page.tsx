'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
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
import { SupportAgentWidget, DemandForecastWidget } from '@/components/worker/AgentWidgets';
import { TopBar } from '@/components/ui/TopBar';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { MetricCard } from '@/components/ui/MetricCard';
import { HAMALI_WILLING_RADIUS_KM } from '@/lib/matchingConstants';
import { BoxIcon, WalletIcon, StarIcon, ChevronRightIcon, MapPinIcon, ShieldIcon } from '@/components/ui/icons';

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function HamaliDashboardPage() {
  const t = useTranslations('workerDashboard');
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
  const todayLines = earnings?.lines.filter((l) => l.completedAt && new Date(l.completedAt).getTime() >= startOfToday()) ?? [];
  const todayTotal = todayLines.reduce((sum, l) => sum + l.amount, 0);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="min-h-screen bg-ip-surface pb-24">
      <TopBar title="FYRO" showBack={false} right={<NotificationBell href="/hamali/notifications" />} />

      <div className="max-w-lg mx-auto px-ip-edge pt-ip-sm">
        <div className="flex items-center gap-3.5 mb-6">
          <Avatar name={user?.name ?? '?'} photoUrl={user?.profilePhoto} accent="secondary" size="lg" status={status ?? undefined} />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ip-on-surface-variant">{t('welcomeBack')}</p>
            <h1 className="font-heading text-xl font-bold truncate">{firstName}</h1>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-semibold bg-secondary/10 text-secondary-600 px-2.5 py-1.5 rounded-ip-pill flex-shrink-0">
            <StarIcon className="w-3.5 h-3.5" fill="currentColor" />
            {user?.ratingCount ? user.ratingAvg?.toFixed(1) : t('new')}
          </span>
        </div>

        <NotificationPrompt accent="secondary" copy={t('notifyPrompt')} />

        {status !== null && (
          <div className="mb-5">
            <OnlineToggle status={status} onStatusChange={(s) => setStatus(s)} accent="secondary" />
          </div>
        )}

        <div className="rounded-ip-card bg-secondary-600 text-white p-6 mb-5">
          <p className="text-xs uppercase tracking-wide text-white/75 mb-1">{t('todaysEarnings')}</p>
          <p className="font-heading text-4xl font-extrabold tabular-nums">₹{todayTotal}</p>
          <Link href="/hamali/earnings" className="inline-flex items-center gap-1 mt-3 pt-3 border-t border-white/20 text-sm font-semibold w-full">
            {t('viewEarnings')} <ChevronRightIcon className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 gap-ip-sm mb-5">
          <MetricCard label={t('jobs')} value={earnings?.jobCount ?? 0} icon={<BoxIcon className="w-5 h-5" />} />
          <MetricCard
            label={t('rating')}
            value={user?.ratingCount ? user.ratingAvg?.toFixed(1) : t('new')}
            icon={<StarIcon className="w-5 h-5" fill="currentColor" />}
          />
        </div>

        {activeJob ? (
          <Link href={`/hamali/active-job/${activeJob._id}`} className="block mb-5">
            <div className="ip-card hover:bg-ip-surface-container-high transition-colors duration-base">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant">{t('activeJob')}</span>
                <StatusPill status={activeJob.status} />
              </div>
              <div className="space-y-1.5 mb-3">
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-secondary-600" />
                  <p className="text-sm truncate">{activeJob.pickupLocation.address}</p>
                </div>
                <div className="flex items-start gap-2">
                  <MapPinIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-ip-on-surface-variant" />
                  <p className="text-sm text-ip-on-surface-variant truncate">{activeJob.dropLocation.address}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-secondary-600">
                {t('viewJob')} <ChevronRightIcon className="w-4 h-4" />
              </span>
            </div>
          </Link>
        ) : (
          <div className="ip-card flex items-center gap-3 mb-5">
            <BoxIcon className="w-8 h-8 text-ip-on-surface-variant flex-shrink-0" />
            <p className="text-sm text-ip-on-surface-variant">{t('noActiveJob')}</p>
          </div>
        )}

        {willingLocation !== undefined && (
          <ServiceAreaCard initial={willingLocation} radiusKm={HAMALI_WILLING_RADIUS_KM} accent="secondary" />
        )}

        <Link href="/hamali/earnings" className="flex items-center justify-between p-4 rounded-ip-card bg-ip-surface-container hover:bg-ip-surface-container-high transition-colors duration-base mb-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center">
              <WalletIcon className="w-5 h-5" />
            </span>
            <p className="text-sm font-semibold">{t('viewEarnings')}</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
        </Link>

        <Link href="/hamali/insurance" className="flex items-center justify-between p-4 rounded-ip-card bg-ip-surface-container hover:bg-ip-surface-container-high transition-colors duration-base">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center">
              <ShieldIcon className="w-5 h-5" />
            </span>
            <p className="text-sm font-semibold">{t('insuranceProtection')}</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
        </Link>

        <div className="mt-5">
          <DemandForecastWidget region={user?.region} accent="secondary" />
          <SupportAgentWidget accent="secondary" />
        </div>

        {pendingRatingId && (
          <RatingModal
            bookingId={pendingRatingId}
            open
            accent="secondary"
            title={t('rateLastCustomer')}
            onDone={() => setPendingRatingId(null)}
          />
        )}
      </div>
    </div>
  );
}
