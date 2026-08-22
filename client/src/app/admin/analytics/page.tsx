'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MetricCard } from '@/components/ui/MetricCard';
import { TrendChart } from '@/components/ui/TrendChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { WalletIcon, TruckIcon, LayersIcon, ClockIcon } from '@/components/ui/icons';

const HeatmapMap = dynamic(() => import('@/components/map/HeatmapMap'), { ssr: false });

interface AnalyticsOverview {
  kpis: {
    revenue: number;
    activeTrips: number;
    completedTrips: number;
    fleetUtilization: number;
    avgDeliveryMinutes: number;
  };
  heatmap: { lat: number; lng: number; intensity: number; label?: string }[];
  revenueTrend: { date: string; total: number }[];
}

// Andhra Pradesh centroid (Vijayawada) — sane default map center per
// DESIGN.md's "real Andhra Pradesh geography" rule when there's no booking
// data yet to derive one from.
const AP_CENTER = { lat: 16.5062, lng: 80.648 };

// New page — DESIGN_INVENTORY.md performance_analytics_heatmaps. Every
// number is a real aggregation (server/src/controllers/analytics.controller.ts,
// new) against Booking/Vehicle — zeros/empty on a sparse dev DB, not
// fabricated placeholders.
export default function AdminAnalyticsPage() {
  const t = useTranslations('adminAnalytics');
  const { data, state } = usePolling(() => api.get<AnalyticsOverview>('/api/admin/analytics/overview'), 30000);
  const kpis = data?.kpis;
  const heatmap = data?.heatmap ?? [];
  const trend = data?.revenueTrend ?? [];

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">{t('subtitle')}</p>

      {state === 'loading' && !data ? (
        <Skeleton className="h-28 mb-8" />
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-10">
          <MetricCard label={t('revenue')} value={`₹${kpis?.revenue ?? 0}`} icon={<WalletIcon className="w-5 h-5" />} />
          <MetricCard label={t('activeTrips')} value={kpis?.activeTrips ?? 0} icon={<TruckIcon className="w-5 h-5" />} />
          <MetricCard label={t('completedTrips')} value={kpis?.completedTrips ?? 0} icon={<LayersIcon className="w-5 h-5" />} />
          <MetricCard label={t('fleetUtilization')} value={`${kpis?.fleetUtilization ?? 0}%`} icon={<TruckIcon className="w-5 h-5" />} />
          <MetricCard label={t('avgDeliveryTime')} value={t('minSuffix', { mins: kpis?.avgDeliveryMinutes ?? 0 })} icon={<ClockIcon className="w-5 h-5" />} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <h2 className="font-heading text-ip-headline-sm font-bold mb-3">{t('demandHotspots')}</h2>
          {heatmap.length === 0 ? (
            <div className="ip-card">
              <EmptyState title={t('noPickupData')} description={t('noPickupDataDesc')} />
            </div>
          ) : (
            <HeatmapMap points={heatmap} center={AP_CENTER} className="h-80" />
          )}
        </div>
        <div>
          <h2 className="font-heading text-ip-headline-sm font-bold mb-3">{t('revenueTrend')}</h2>
          <div className="ip-card">
            {trend.length < 2 ? (
              <EmptyState title={t('notEnoughData')} description={t('notEnoughDataDesc')} />
            ) : (
              <TrendChart
                points={trend.map((t) => t.total)}
                labels={[trend[0].date.slice(5), trend[trend.length - 1].date.slice(5)]}
                height={160}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
