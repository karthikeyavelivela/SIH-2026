'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import type { CustomerMode } from '@/lib/customerMode';

interface Banner {
  _id: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  imageUrl?: string;
}

const DISMISSED_KEY = 'fyro.promo.dismissed';

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    // Private window, blocked storage, cleared data. A dismissal that does
    // not persist is a minor annoyance, not a failure.
    return [];
  }
}

/**
 * The promotional slot on the customer home.
 *
 * It renders nothing when nothing is live, and that is the designed state
 * rather than a fallback. The alternative — hardcoded marketing copy in
 * this component — cannot be changed by anyone who does not deploy, cannot
 * be scheduled, and keeps claiming things after they stop being true. An
 * empty rail is the correct look for a platform with nothing to promote.
 *
 * Content comes from GET /api/promo-banners, which evaluates the live
 * window server-side: a phone with its clock set forward must not be able
 * to see a campaign that has not started.
 *
 * Dismissal is per-browser and per-banner. It is a convenience, not a
 * preference worth a row in the database.
 */
export function PromoRail({ mode }: { mode: CustomerMode }) {
  const t = useTranslations('customerHome');
  const [banners, setBanners] = useState<Banner[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    setDismissed(readDismissed());
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ banners: Banner[] }>(`/api/promo-banners?mode=${mode}`)
      .then((res) => {
        if (!cancelled) setBanners(res.banners);
      })
      .catch(() => {
        // A promotional rail is the least important thing on this screen.
        // It fails silently rather than putting an error where an
        // advertisement would have been.
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const visible = banners.filter((b) => !dismissed.includes(b._id));
  if (visible.length === 0) return null;

  function dismiss(id: string) {
    const next = [...dismissed, id];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED_KEY, JSON.stringify(next.slice(-40)));
    } catch {
      /* see readDismissed */
    }
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto -mx-gutter px-gutter pb-1 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label={t('promoAria')}
    >
      {visible.map((banner) => {
        const inner = (
          <>
            {banner.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={banner.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <span
              aria-hidden
              className={`absolute inset-0 ${
                banner.imageUrl
                  ? 'bg-gradient-to-r from-fy-brown via-fy-brown/80 to-fy-brown/30'
                  : 'bg-gradient-to-br from-fy-brown to-fy-brown-soft'
              }`}
            />
            <span className="relative flex flex-col gap-1 min-w-0 pr-8">
              <span className="font-heading text-title text-fy-bone leading-tight">{banner.title}</span>
              {banner.body && (
                <span className="font-body text-label text-fy-on-brown-soft line-clamp-2">{banner.body}</span>
              )}
              {banner.ctaLabel && (
                <span className="mt-1 inline-flex items-center gap-1 font-body text-label font-semibold text-fy-lime">
                  {banner.ctaLabel}
                  <Icon name="arrow_forward" size={14} />
                </span>
              )}
            </span>
          </>
        );

        return (
          <div
            key={banner._id}
            className="relative shrink-0 snap-start w-[86%] max-w-[420px] h-[124px] rounded-card overflow-hidden shadow-card"
          >
            {banner.ctaHref ? (
              <Link href={banner.ctaHref} className="absolute inset-0 flex flex-col justify-center px-4">
                {inner}
              </Link>
            ) : (
              <div className="absolute inset-0 flex flex-col justify-center px-4">{inner}</div>
            )}
            <button
              type="button"
              onClick={() => dismiss(banner._id)}
              aria-label={t('promoDismiss')}
              className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-fy-ink/35 text-fy-bone flex items-center justify-center backdrop-blur-sm"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
