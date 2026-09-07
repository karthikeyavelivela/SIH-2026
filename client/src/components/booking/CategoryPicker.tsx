'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import {
  TruckIcon,
  BoxIcon,
  PowerIcon,
  WrenchIcon,
  PaintBrushIcon,
  HomeIcon,
  UsersIcon,
  LeafIcon,
  BroomIcon,
  ShieldIcon,
} from '@/components/ui/icons';

// Maps ServiceCategory.icon (a component-name string, seedServiceCategories.ts)
// to the real icon component — the server never imports React components,
// this is the one place that string gets resolved back into one.
export const CATEGORY_ICONS: Record<string, typeof TruckIcon> = {
  TruckIcon, BoxIcon, PowerIcon, WrenchIcon, PaintBrushIcon, HomeIcon, UsersIcon, LeafIcon, BroomIcon, ShieldIcon,
};
const ICONS = CATEGORY_ICONS;

export interface ServiceCategory {
  _id: string;
  name: string;
  slug: string;
  icon: string;
  accentColor: 'primary' | 'secondary';
  pricingUnit: 'per_hour' | 'per_job' | 'per_km' | 'per_worker';
  dispatchType: 'truck' | 'hamali';
}

interface CategoryPickerProps {
  selectedSlug: string | null;
  onSelect: (category: ServiceCategory | null) => void;
  /** When provided (e.g. the household/labour/transport booking pages,
   * which already fetch+bucket the full list to build their own hero/grid),
   * skips this component's own fetch and renders exactly this set instead
   * of all 12 categories — so a mode-specific booking page never shows
   * categories from the other two modes. */
  categories?: ServiceCategory[];
}

// SIH26089 Phase C — the real category grid, replacing the implicit
// "everything is either a truck or Hamali labour job" framing with the
// PS's own 10 named household/community services (plus the platform's 2
// pre-existing generic ones) as first-class, separately bookable
// categories. Selecting one drives both the underlying dispatch type
// (booking.controller.ts derives `type` server-side from the category,
// never trusts a client-sent one alongside a category) and the category-
// specific copy the rest of the booking form shows.
export function CategoryPicker({ selectedSlug, onSelect, categories: providedCategories }: CategoryPickerProps) {
  const t = useTranslations('categoryPicker');
  const [fetchedCategories, setFetchedCategories] = useState<ServiceCategory[] | null>(null);

  useEffect(() => {
    if (providedCategories) return; // parent already has the list — don't double-fetch
    api
      .get<{ categories: ServiceCategory[] }>('/api/service-categories')
      .then((res) => setFetchedCategories(res.categories))
      .catch(() => setFetchedCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = providedCategories ?? fetchedCategories;

  if (!categories) {
    return <div className="grid grid-cols-3 gap-2 mb-4">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-card bg-fy-field animate-pulse" />)}</div>;
  }
  if (categories.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-fy-ink-soft mb-2">{t('heading')}</p>
      <div className="grid grid-cols-3 gap-2">
        {categories.map((c) => {
          const Icon = ICONS[c.icon] ?? BoxIcon;
          const selected = selectedSlug === c.slug;
          // Full static class strings (never a template-built `border-${x}`)
          // so Tailwind's JIT scanner — which only generates classes it can
          // literally find in source — actually produces these.
          const selectedClasses =
            c.accentColor === 'primary'
              ? 'border-fy-brown bg-fy-brown/10 text-fy-brown'
              : 'border-fy-green bg-fy-green/10 text-fy-green';
          return (
            <button
              key={c._id}
              type="button"
              onClick={() => onSelect(selected ? null : c)}
              className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-card border text-center transition-colors duration-fast ${
                selected ? selectedClasses : 'border-fy-muted/15 text-fy-ink-soft hover:bg-fy-field'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-semibold leading-tight">{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
