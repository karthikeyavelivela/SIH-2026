'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { Media } from '@/components/ui/Media';
import { useCategoryName } from '@/lib/categoryName';
import { usePublishedRates } from '@/lib/usePublishedRates';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';

/** Which glyph each category falls back to when its photograph has not loaded. */
const CATEGORY_GLYPH: Record<string, string> = {
  electrician: 'bolt',
  plumber: 'plumbing',
  carpenter: 'carpenter',
  painter: 'format_paint',
  domestic_helper: 'home_work',
  caregiver: 'volunteer_activism',
  gardener: 'potted_plant',
  cleaner: 'cleaning_services',
  technician: 'build',
  driver: 'local_taxi',
  general_logistics: 'local_shipping',
  general_labour: 'engineering',
  agri_labour: 'agriculture',
};

/** Where tapping a category goes. Two of the twelve are whole modes, not trades. */
export function hrefFor(slug: string): string {
  if (slug === 'general_logistics') return '/customer/book/transport';
  if (slug === 'general_labour') return '/customer/book/labour';
  if (slug === 'agri_labour') return '/customer/book/labour?work=farm';
  return `/customer/service/${slug}`;
}

/**
 * The category grid — four across on a phone.
 *
 * Each tile carries the category's own photograph, its own name in the
 * reader's language, and its own real starting price read from the active
 * fare rule for their region. A tile with no published rate shows no price
 * rather than a zero or a dash: "from ₹0" is a worse answer than silence.
 *
 * Four columns is dense enough that nine trades fit above the fold on a
 * phone, which is the point — the previous layout put one hero photograph
 * and a two-column bento below it, so the ninth trade was three scrolls
 * down.
 */
export function CategoryGrid({
  categories,
  cap,
  seeAllHref,
  heading,
}: {
  categories: ServiceCategory[];
  /** Show at most this many, with a "see all" link. Absent shows everything. */
  cap?: number;
  seeAllHref?: string;
  heading: string;
}) {
  const t = useTranslations('customerHome');
  const categoryName = useCategoryName();
  const { rateFor } = usePublishedRates();

  const shown = cap ? categories.slice(0, cap) : categories;
  const capped = cap != null && categories.length > cap;

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="font-heading text-title text-fy-ink">{heading}</h2>
        {capped && seeAllHref && (
          <Link href={seeAllHref} className="font-body text-label font-semibold text-fy-brown hover:underline shrink-0">
            {t('seeAll')}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-4 gap-x-2 gap-y-4">
        {shown.map((category) => {
          const rate = rateFor(category);
          return (
            <Link
              key={category.slug}
              href={hrefFor(category.slug)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="relative w-full aspect-square rounded-card overflow-hidden bg-fy-panel border border-fy-hairline/40 transition-transform group-active:scale-95">
                <Media
                  id={`household.category.${category.slug}`}
                  kind="photo"
                  fill
                  treatment="full-bleed"
                  tint="household"
                  alt=""
                  className="w-full h-full"
                />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-fy-brown/55 to-transparent" />
                <span
                  aria-hidden
                  className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-fy-bone/90 text-fy-brown flex items-center justify-center"
                >
                  <Icon name={CATEGORY_GLYPH[category.slug] ?? 'handyman'} size={14} />
                </span>
              </span>

              <span className="font-body text-[11px] leading-tight text-fy-ink text-center line-clamp-2">
                {categoryName(category)}
              </span>

              {/* No rate published for this region means no price shown.
                  "from ₹0" would be a lie with a number on it. */}
              {rate && (
                <span className="font-mono text-[10px] text-fy-muted leading-none">
                  {t('fromPrice', { amount: rate.minimumFare })}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
