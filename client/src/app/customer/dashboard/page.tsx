'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { bucketCategories } from '@/lib/categoryBuckets';
import { FYRO_LOGO_URL } from '@/lib/brand';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { LanguageDial } from '@/components/fy/LanguageDial';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { TaraEntry } from '@/components/ui/TaraEntry';
import { SearchScanBar } from '@/components/customer/SearchScanBar';
import { PromoRail } from '@/components/customer/PromoRail';
import { CategoryGrid } from '@/components/customer/CategoryGrid';
import { RecommendationsRow } from '@/components/customer/RecommendationsRow';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';
import { LightCard, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { ProgressBar } from '@/components/fy/Data';

/**
 * The customer's Household home.
 *
 * Rebuilt to a simpler structure: brand bar, one search field with the scan
 * action docked beside it, a promotional slot, the trades as a four-across
 * grid, then what this person has booked before.
 *
 * What went, and why:
 *
 *   - The corner rotary dial. It never rendered correctly, and its trigger
 *     is now the bottom bar's raised centre button (see CustomerTabBar).
 *     This page no longer wraps itself in a mode control at all.
 *   - The 240px hero photograph and the two-column bento beneath it. Between
 *     them they pushed the ninth trade three scrolls down; nine tiles at four
 *     across fit above the fold instead.
 *   - The "cooperative guarantee" strip and the recent-bookings list, which
 *     are both real but are not what a person opens this screen to do. The
 *     guarantee is on every category page where it actually applies, and
 *     bookings have their own tab in the bar.
 *
 * Everything on this screen is this mode's. The grid is bucketed to
 * household trades, search is scoped to household, and the "book again" row
 * only offers trades bookable here — see the leak audit in customerMode.ts.
 */

interface BookingSummary {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  serviceCategorySlug?: string;
  fareBreakdown: { total: number };
  pickupLocation: { address: string };
  dropLocation: { address: string };
  createdAt: string;
}

const PROGRESS_STEPS = ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed'];

function shortAddress(address: string): string {
  return address.split(',')[0];
}

export default function CustomerDashboardPage() {
  const t = useTranslations('customerHome');
  const tDash = useTranslations('customerDashboard');
  const router = useRouter();
  const { addresses: savedAddresses } = useSavedAddresses();

  const bookingsState = useApiState(
    () => api.get<{ bookings: BookingSummary[] }>('/api/bookings').then((r) => r.bookings),
    []
  );
  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );

  const buckets = useMemo(() => bucketCategories(categoriesState.data ?? []), [categoriesState.data]);
  const household = buckets.household;

  const bookings = bookingsState.data ?? [];
  const activeBooking = bookings.find((b) => !['completed', 'cancelled'].includes(b.status));
  const activeStepIndex = activeBooking ? PROGRESS_STEPS.indexOf(activeBooking.status) : -1;
  const progressPct = activeStepIndex >= 0 ? Math.round((activeStepIndex / (PROGRESS_STEPS.length - 1)) * 100) : 0;

  const statusLabel: Record<string, string> = {
    scheduled: tDash('status.scheduled'),
    requested: tDash('status.requested'),
    searching: tDash('status.searching'),
    matched: tDash('status.matched'),
    accepted: tDash('status.accepted'),
    in_progress: tDash('status.in_progress'),
    completed: tDash('status.completed'),
    cancelled: tDash('status.cancelled'),
  };

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      {/* Brand bar. The wordmark is the real logo asset, not type set to
          look like one. */}
      <header className="sticky top-0 z-30 bg-fy-bone/92 backdrop-blur-xl">
        <div className="h-14 max-w-2xl mx-auto px-gutter flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/customer/profile" aria-label={t('menuAria')} className="w-10 h-10 -ml-2 rounded-full flex items-center justify-center text-fy-ink hover:bg-fy-well transition-colors shrink-0">
              <Icon name="menu" size={22} />
            </Link>
            <Image src={FYRO_LOGO_URL} alt="FYRO" width={26} height={26} className="rounded shrink-0" />
            <span className="font-heading text-title text-fy-ink">FYRO</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <LanguageDial size="sm" />
            <NotificationBell href="/customer/notifications" />
          </div>
        </div>
      </header>

      <main className="fy-pad-nav px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-5 pt-1">
        <NotificationPrompt accent="primary" copy={tDash('notifyPrompt')} />

        <SearchScanBar mode="household" />

        <Link
          href="/customer/profile"
          className="self-start inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-fy-edge text-fy-ink-soft font-body text-label min-w-0"
        >
          <Icon name="location_on" size={14} className="text-fy-brown shrink-0" />
          <span className="truncate max-w-[180px]">{savedAddresses[0]?.label ?? tDash('setYourArea')}</span>
          <Icon name="expand_more" size={14} className="shrink-0" />
        </Link>

        {activeBooking && (
          <Link href={`/customer/track/${activeBooking._id}`} className="block">
            <LightCard className="p-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fy-lime opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fy-green" />
                </span>
                <div className="flex flex-col min-w-0">
                  <EyebrowLabel tone="green">{tDash('activeTracking')}</EyebrowLabel>
                  <p className="font-body text-label text-fy-ink truncate">
                    {statusLabel[activeBooking.status] ?? activeBooking.status} ·{' '}
                    {shortAddress(activeBooking.pickupLocation.address)} →{' '}
                    {shortAddress(activeBooking.dropLocation.address)}
                  </p>
                </div>
              </div>
              <IconTile tone="peach" size="sm" className="rounded-full">
                <Icon name="near_me" size={18} />
              </IconTile>
            </LightCard>
            <ProgressBar value={progressPct} tone="lime" className="mt-1.5 mx-1" />
          </Link>
        )}

        <PromoRail mode="household" />

        {categoriesState.status === 'loading' && (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-card bg-fy-field animate-pulse" />
            ))}
          </div>
        )}
        {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} />}

        {household.length > 0 && <CategoryGrid categories={household} heading={t('householdHeading')} />}

        {household.length === 0 && categoriesState.status !== 'loading' && (
          <EmptyState title={tDash('noCategoriesTitle')} />
        )}

        {bookingsState.status === 'loading' && <Skeleton lines={2} className="h-20" />}
        {bookingsState.status === 'success' && (
          <RecommendationsRow bookings={bookings} categories={household} />
        )}

        {/* Nothing booked yet, and nothing to re-book. One line and a way in,
            rather than a row of arbitrary categories dressed as suggestions. */}
        {bookingsState.status === 'empty' && household.length > 0 && (
          <Body size="label" className="text-center">
            {t('nothingBookedYet')}
          </Body>
        )}

        <TaraEntry accent="primary" />
      </main>
    </div>
  );
}
