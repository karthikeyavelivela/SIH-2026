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
const ICONS: Record<string, typeof TruckIcon> = {
  TruckIcon, BoxIcon, PowerIcon, WrenchIcon, PaintBrushIcon, HomeIcon, UsersIcon, LeafIcon, BroomIcon, ShieldIcon,
};

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
}

// SIH26089 Phase C — the real category grid, replacing the implicit
// "everything is either a truck or Hamali labour job" framing with the
// PS's own 10 named household/community services (plus the platform's 2
// pre-existing generic ones) as first-class, separately bookable
// categories. Selecting one drives both the underlying dispatch type
// (booking.controller.ts derives `type` server-side from the category,
// never trusts a client-sent one alongside a category) and the category-
// specific copy the rest of the booking form shows.
export function CategoryPicker({ selectedSlug, onSelect }: CategoryPickerProps) {
  const t = useTranslations('categoryPicker');
  const [categories, setCategories] = useState<ServiceCategory[] | null>(null);

  useEffect(() => {
    api
      .get<{ categories: ServiceCategory[] }>('/api/service-categories')
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
  }, []);

  if (!categories) {
    return <div className="grid grid-cols-3 gap-2 mb-4">{[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-ip-card bg-ip-surface-container animate-pulse" />)}</div>;
  }
  if (categories.length === 0) return null;

  return (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">{t('heading')}</p>
      <div className="grid grid-cols-3 gap-2">
        {categories.map((c) => {
          const Icon = ICONS[c.icon] ?? BoxIcon;
          const selected = selectedSlug === c.slug;
          // Full static class strings (never a template-built `border-${x}`)
          // so Tailwind's JIT scanner — which only generates classes it can
          // literally find in source — actually produces these.
          const selectedClasses =
            c.accentColor === 'primary'
              ? 'border-ip-primary bg-ip-primary/10 text-ip-primary'
              : 'border-ip-secondary bg-ip-secondary/10 text-ip-secondary';
          return (
            <button
              key={c._id}
              type="button"
              onClick={() => onSelect(selected ? null : c)}
              className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-ip-card border text-center transition-colors duration-fast ${
                selected ? selectedClasses : 'border-ip-outline/15 text-ip-on-surface-variant hover:bg-ip-surface-container'
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
