'use client';

import { hrefFor } from '@/components/customer/CategoryGrid';
import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Media } from '@/components/ui/Media';
import { useCategoryName } from '@/lib/categoryName';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';

interface BookingSummary {
  _id: string;
  serviceCategorySlug?: string;
  createdAt: string;
}

/**
 * "Book again" — the trades this person has actually used, most recent
 * first.
 *
 * Deliberately NOT "recommended for you". Nothing on this platform computes
 * a recommendation: there is no collaborative filter, no similarity model
 * and no popularity ranking, and a row labelled "recommended" that is
 * really "these are the first four categories in the database" is the kind
 * of quiet dishonesty this codebase keeps refusing.
 *
 * What does exist is the person's own booking history, which is real, is
 * theirs, and answers the same question ("what am I likely to want?") with
 * a claim that can be checked. A customer with no history sees nothing —
 * the row does not render rather than falling back to an arbitrary list.
 */
export function RecommendationsRow({
  bookings,
  categories,
}: {
  bookings: BookingSummary[];
  categories: ServiceCategory[];
}) {
  const t = useTranslations('customerHome');
  const categoryName = useCategoryName();

  const rebookable = useMemo(() => {
    const bySlug = new Map(categories.map((c) => [c.slug, c]));
    const seen = new Set<string>();
    const out: ServiceCategory[] = [];
    // Bookings arrive newest-first from the API; the first time a slug
    // appears is therefore the most recent time it was booked.
    for (const booking of bookings) {
      const slug = booking.serviceCategorySlug;
      if (!slug || seen.has(slug)) continue;
      const category = bySlug.get(slug);
      if (!category) continue;
      seen.add(slug);
      out.push(category);
      if (out.length === 6) break;
    }
    return out;
  }, [bookings, categories]);

  if (rebookable.length === 0) return null;

  return (
    <section>
      <h2 className="font-heading text-title text-fy-ink mb-3">{t('bookAgain')}</h2>
      <div className="flex gap-2.5 overflow-x-auto -mx-gutter px-gutter pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rebookable.map((category) => (
          <Link
            key={category.slug}
            href={hrefFor(category.slug)}
            className="shrink-0 w-[132px] rounded-card overflow-hidden bg-fy-card border border-fy-hairline/40 shadow-card"
          >
            <span className="relative block w-full h-[74px]">
              <Media
                id={`household.category.${category.slug}`}
                kind="photo"
                fill
                treatment="full-bleed"
                tint="household"
                alt=""
                className="w-full h-full"
              />
            </span>
            <span className="block px-2.5 py-2 font-body text-label text-fy-ink leading-tight line-clamp-2">
              {categoryName(category)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
