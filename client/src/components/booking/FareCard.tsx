'use client';

import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/Skeleton';
import type { FareCategory } from '@/components/worker/AgentWidgets';

// Same three-tier thresholds as fare.service.ts's bucketVehicleCategoryFromCapacity
// (server-side, authoritative) — mirrored here only to pick which category
// label to show the pricing-quote agent widget for; the server never
// trusts this, it re-derives its own category from the real active
// FareRule lookup keyed on whatever category string this sends.
export function bucketVehicleCategory(capacityKg: number): FareCategory {
  if (capacityKg <= 1000) return 'vehicle_small';
  if (capacityKg <= 5000) return 'vehicle_medium';
  return 'vehicle_large';
}

export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  hamaliFare: number;
  surgeMultiplier: number;
  total: number;
}

// Extracted out of customer/book/page.tsx (a Next.js App Router page.tsx
// may only export `default` plus a small fixed allow-list of special names
// — Next's own generated route types fail the build on any other named
// export) so Phase 7.1's client test suite can import and exercise this
// directly. See BookingCreation.test.tsx.
export function FareCard({
  state,
  fare,
  errorMessage,
}: {
  state: 'idle' | 'loading' | 'ready' | 'error';
  fare: FareBreakdown | null;
  errorMessage: string | null;
}) {
  const t = useTranslations('customerBook');
  if (state === 'idle') {
    return (
      <div className="text-center py-6 text-ip-body-sm text-ip-on-surface-variant">
        {t('fareIdle')}
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="ip-card">
        <Skeleton lines={3} className="h-4" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="rounded-ip-card bg-ip-error-container text-ip-on-error-container text-sm p-ip-md">
        {errorMessage ?? t('fareErrorGeneric')}
      </div>
    );
  }
  if (!fare) return null;
  return (
    <div className="ip-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-3">{t('fareEstimate')}</p>
      <div className="space-y-1.5 text-sm">
        {fare.baseFare > 0 && (
          <div className="flex justify-between">
            <span className="text-ip-on-surface-variant">{t('baseFare')}</span>
            <span>₹{fare.baseFare}</span>
          </div>
        )}
        {fare.distanceFare > 0 && (
          <div className="flex justify-between">
            <span className="text-ip-on-surface-variant">{t('distance')}</span>
            <span>₹{fare.distanceFare}</span>
          </div>
        )}
        {fare.hamaliFare > 0 && (
          <div className="flex justify-between">
            <span className="text-ip-on-surface-variant">{t('hamaliLabor')}</span>
            <span>₹{fare.hamaliFare}</span>
          </div>
        )}
        {fare.surgeMultiplier > 1 && (
          <div className="flex justify-between text-ip-primary">
            <span>{t('surge')}</span>
            <span>×{fare.surgeMultiplier}</span>
          </div>
        )}
        <div className="flex justify-between pt-2.5 mt-1 border-t border-ip-outline/10">
          <span className="font-heading font-bold text-ip-on-surface">{t('total')}</span>
          <span className="font-heading font-bold text-lg text-ip-on-surface tabular-nums">₹{fare.total}</span>
        </div>
      </div>
    </div>
  );
}
