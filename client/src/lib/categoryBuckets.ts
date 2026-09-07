import type { ServiceCategory } from '@/components/booking/CategoryPicker';

/**
 * Buckets the platform's 12 service categories into the three real booking
 * modes (Household / Hamali·Labour / Transit) — used by the dashboard's
 * category grid and by each dedicated /customer/book/<mode> page, so the
 * split stays consistent everywhere instead of being redefined per page.
 * `general_labour` is the traditional hamali/loading-crew category — the
 * one thing genuinely distinct from a named household trade even though
 * both ride `dispatchType:'hamali'` server-side, so slug (not dispatchType
 * alone) is the discriminator. Everything with dispatchType:'truck' (cargo
 * logistics + driver) is Transit; the remaining 9 named trades are
 * Household.
 */
export function bucketCategories(categories: ServiceCategory[]) {
  const household: ServiceCategory[] = [];
  const labour: ServiceCategory[] = [];
  const transport: ServiceCategory[] = [];
  for (const c of categories) {
    if (c.slug === 'general_labour') labour.push(c);
    else if (c.dispatchType === 'truck') transport.push(c);
    else household.push(c);
  }
  return { household, labour, transport };
}
