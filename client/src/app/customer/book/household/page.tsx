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

  return null;
}

export default function HouseholdBookPage() {
  return (
    <Suspense fallback={null}>
      <HouseholdBookRedirect />
    </Suspense>
  );
}
