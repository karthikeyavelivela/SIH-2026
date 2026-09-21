'use client';

import { api } from '@/lib/api';
import { cachedGet, CATALOGUE_TTL_MS } from '@/lib/apiCache';
import type { ServiceCategory } from '@/components/booking/CategoryPicker';

/**
 * The twelve service categories.
 *
 * Seven screens need this list and none of them can change it — it is
 * seeded data an admin edits from the console. Fetching it fresh on every
 * one of those screens cost 0.43s a time against production, on a list
 * that had not changed since the app opened.
 *
 * Kept as a function rather than a hook so the existing useApiState call
 * sites need only swap their fetcher.
 */
export function fetchServiceCategories(): Promise<ServiceCategory[]> {
  return cachedGet('service-categories', CATALOGUE_TTL_MS, () =>
    api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories)
  );
}
