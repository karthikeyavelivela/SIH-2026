'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
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

const AUTOPLAY_MS = 5000;
// After a person swipes, leave the rail where they put it for a while
// rather than yanking it away mid-look.
const RESUME_AFTER_TOUCH_MS = 9000;

/**
 * The promotional carousel on the customer home.
 *
 * Photograph first, words second. It began as brown text cards (a heading,
 * a sentence and a call to action over a darkened photo), went to
 * pictures only, and settles here: the photograph fills the card and a
 * single line of headline plus a small call-to-action pill sits on a soft
 * shade at the foot of it. The banner's longer body text is not printed —
 * a carousel is glanced at, not read.
 *
 * Household home only; the Labour and Transit homes do not carry it.
 *
 * A banner without a photograph is skipped. Moves on its own every five
 * seconds, and stops while the tab is hidden, for a while after the person
 * touches it, and entirely under reduced motion.
 *
 * Content comes from GET /api/promo-banners, which evaluates the live
 * window server-side, and the rail renders nothing when nothing is live.
 */
export function PromoRail({ mode }: { mode: CustomerMode }) {
  const t = useTranslations('customerHome');
  const [banners, setBanners] = useState<Banner[]>([]);
  const [active, setActive] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const pausedUntil = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ banners: Banner[] }>(`/api/promo-banners?mode=${mode}`)
      .then((res) => {
        if (!cancelled) setBanners(res.banners.filter((b) => b.imageUrl));
      })
      .catch(() => {
        // The least important thing on this screen. It fails silently rather
        // than putting an error where an advertisement would have been.
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const goTo = useCallback((index: number) => {
    const track = trackRef.current;
    const slide = track?.children[index] as HTMLElement | undefined;
    if (!track || !slide) return;
    // Centre the slide, so the neighbours peek in evenly on both sides.
    const left = slide.offsetLeft - (track.clientWidth - slide.clientWidth) / 2;
    track.scrollTo({ left, behavior: 'smooth' });
  }, []);

  // Which slide is showing, read from where the track actually is — so a
  // swipe, a tap on a dot and the autoplay all agree.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let frame = 0;
    function onScroll() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!track) return;
        const centre = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        Array.from(track.children).forEach((child, i) => {
          const el = child as HTMLElement;
          const d = Math.abs(el.offsetLeft + el.clientWidth / 2 - centre);
          if (d < bestDist) {
            bestDist = d;
            best = i;
          }
        });
        activeRef.current = best;
        setActive(best);
      });
    }
    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      track.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [banners.length]);

  useEffect(() => {
    if (banners.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || Date.now() < pausedUntil.current) return;
      goTo((activeRef.current + 1) % banners.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [banners.length, goTo]);

  if (banners.length === 0) return null;

  function holdStill() {
    pausedUntil.current = Date.now() + RESUME_AFTER_TOUCH_MS;
  }

  return (
    <section aria-roledescription="carousel" aria-label={t('promoAria')} className="-mx-gutter">
      <div
        ref={trackRef}
        onPointerDown={holdStill}
        onWheel={holdStill}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-gutter py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((banner, i) => {
          const isActive = i === active;
          const picture = (
            <>
              <Image
                src={banner.imageUrl!}
                alt=""
                fill
                priority={i === 0}
                sizes="(max-width: 672px) 88vw, 590px"
                className={`object-cover transition-transform duration-[1400ms] ease-out motion-reduce:transition-none ${
                  isActive ? 'scale-100' : 'scale-[1.06]'
                }`}
              />
              {/* Shade only where the words are, so the photograph keeps its
                  own light everywhere else. */}
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
              <span aria-hidden className="absolute inset-0 rounded-[22px] ring-1 ring-inset ring-black/[0.06]" />
              <span className="absolute inset-x-0 bottom-0 p-4 flex items-end justify-between gap-3">
                <span className="min-w-0 font-heading text-[17px] leading-[1.2] font-semibold text-white line-clamp-2 [text-shadow:0_1px_12px_rgba(0,0,0,0.35)]">
                  {banner.title}
                </span>
                {banner.ctaLabel && banner.ctaHref && (
                  <span className="shrink-0 inline-flex items-center gap-1 h-8 pl-3 pr-2 rounded-full bg-white/90 text-fy-ink font-body text-[12px] font-semibold backdrop-blur-sm">
                    {banner.ctaLabel}
                    <Icon name="arrow_forward" size={14} />
                  </span>
                )}
              </span>
            </>
          );
          const frame = `relative block w-full h-full overflow-hidden rounded-[22px] bg-fy-field transition-[transform,opacity] duration-500 ease-out motion-reduce:transition-none ${
            isActive ? 'opacity-100 scale-100' : 'opacity-80 scale-[0.97]'
          }`;

          return (
            <div
              key={banner._id}
              role="group"
              aria-roledescription="slide"
              aria-label={t('promoSlide', { n: i + 1, total: banners.length })}
              className="relative shrink-0 snap-center w-[88%] max-w-[590px] aspect-[2/1] rounded-[22px] shadow-[0_14px_32px_-16px_rgba(58,34,18,0.45)]"
            >
              {banner.ctaHref ? (
                <Link href={banner.ctaHref} className={frame}>
                  {picture}
                </Link>
              ) : (
                <div className={frame}>{picture}</div>
              )}
            </div>
          );
        })}
      </div>

      {banners.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {banners.map((b, i) => (
            <button
              key={b._id}
              type="button"
              aria-current={i === active ? 'true' : undefined}
              aria-label={t('promoSlide', { n: i + 1, total: banners.length })}
              onClick={() => {
                holdStill();
                goTo(i);
              }}
              // A 24px hit area around a 6px dot.
              className="group h-6 px-0.5 flex items-center"
            >
              <span
                className={`block h-1.5 rounded-full transition-all duration-300 ease-out ${
                  i === active ? 'w-5 bg-fy-brown' : 'w-1.5 bg-fy-ink/20 group-hover:bg-fy-ink/35'
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
