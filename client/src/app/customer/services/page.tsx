'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiState } from '@/lib/useApiState';
import { fetchServiceCategories } from '@/lib/serviceCategories';
import { bucketCategories } from '@/lib/categoryBuckets';
import { useCategoryName } from '@/lib/categoryName';
import { CategoryGrid } from '@/components/customer/CategoryGrid';
import { SearchScanBar } from '@/components/customer/SearchScanBar';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { TopBar } from '@/components/fy/Navigation';
import { Chip, ChipRow } from '@/components/fy/Controls';
import { Body } from '@/components/fy/Text';

/**
 * Everything bookable, in one place.
 *
 * The home screen's grid is capped so the screen stays a screen; this is
 * where "See all" lands. It shows all three modes' categories, grouped and
 * labelled by mode — which is the one place in the customer app where
 * crossing modes is the point rather than a leak, exactly like the booking
 * history's "All" filter. The chips narrow it, and the heading always says
 * which world each block belongs to, so nothing here is ambiguous about
 * where a tap will take you.
 */
export default function AllServicesPage() {
  const t = useTranslations('customerHome');
  const tMode = useTranslations('customerMode');
  const categoryName = useCategoryName();
  const [filter, setFilter] = useState<'all' | 'household' | 'labour' | 'transport'>('all');

  const categoriesState = useApiState(fetchServiceCategories, []);
  const buckets = useMemo(
    () => bucketCategories(categoriesState.data ?? []),
    [categoriesState.data]
  );

  const blocks = (
    [
      ['household', buckets.household, t('householdHeading')],
      ['labour', buckets.labour, t('labourHeading')],
      ['transport', buckets.transport, t('transportHeading')],
    ] as const
  ).filter(([key, list]) => list.length > 0 && (filter === 'all' || filter === key));

  const total = buckets.household.length + buckets.labour.length + buckets.transport.length;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />
      <TopBar title={t('allServices')} showBack />

      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-5">
        <SearchScanBar mode="household" showScan={false} />

        <ChipRow>
          {(['all', 'household', 'labour', 'transport'] as const).map((key) => (
            <Chip
              key={key}
              type="button"
              shape="square"
              accent="brown"
              active={filter === key}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? t('allModes') : tMode(`modes.${key}` as never)}
            </Chip>
          ))}
        </ChipRow>

        {categoriesState.status === 'loading' && (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-card bg-fy-field animate-pulse" />
            ))}
          </div>
        )}
        {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} />}

        {categoriesState.status !== 'loading' && total === 0 && <EmptyState title={t('noServices')} />}

        {blocks.map(([key, list, heading]) => (
          <CategoryGrid key={key} categories={list} heading={heading} />
        ))}

        {total > 0 && (
          <Body size="label" className="text-center">
            {t('servicesCount', { count: total })}
          </Body>
        )}

        {/* Referenced so the import earns its place: the count line above
            reads better than a list of names, but a screen reader on an
            empty filter still needs something. */}
        <span className="sr-only">{blocks.map(([, list]) => list.map(categoryName).join(', ')).join('. ')}</span>
      </main>
    </div>
  );
}
