'use client';

import { Suspense, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { bucketCategories } from '@/lib/categoryBuckets';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';

/**
 * /customer/book/household used to be its own long booking form, carrying a
 * category picker, an address block, a schedule picker, a bidding switch and
 * a fare card.
 *
 * The design set has no separate household form screen: household booking is
 * `household_home` (the dashboard, which lists the categories) followed by
 * `service_detail_booking` (one screen per service). So the form's job is now
 * split between those two, and everything that only existed here — the exact
 * date-time picker, the open-for-bidding switch and the correctable pricing
 * region — moved into /customer/service/[slug] rather than being dropped.
 *
 * This stays as a redirect so existing links keep working: with ?category= it
 * lands on that service, without one it lands on the category list.
 */
function HouseholdBookRedirect() {
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params.get('category');

  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );
  const household = useMemo(
    () => bucketCategories(categoriesState.data ?? []).household,
    [categoriesState.data]
  );

  useEffect(() => {
    if (wanted) {
      router.replace(`/customer/service/${encodeURIComponent(wanted)}`);
      return;
    }
    // No category named — the dashboard is the category list.
    if (categoriesState.status !== 'loading') router.replace('/customer/dashboard');
  }, [wanted, categoriesState.status, household, router]);

  // Unlike the other two compatibility redirects, this one waits on
  // /api/service-categories before it can forward, so returning null would
  // leave the screen blank for the length of that request. A quiet holding
  // state is shown instead.
  return <RedirectHold />;
}

function RedirectHold() {
  return (
    <div className="min-h-screen bg-fy-bone flex flex-col items-center justify-center gap-4">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain opacity-40" />
      <span
        aria-hidden
        className="relative w-10 h-10 rounded-full border-2 border-fy-brown/20 border-t-fy-brown animate-spin"
      />
      <span className="relative font-mono text-[11px] uppercase tracking-widest text-fy-muted">FYRO</span>
    </div>
  );
}

export default function HouseholdBookPage() {
  return (
    <Suspense fallback={<RedirectHold />}>
      <HouseholdBookRedirect />
    </Suspense>
  );
}
