'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BottomTabBar } from '@/components/fy/Navigation';
import { LanguageDial } from '@/components/fy/LanguageDial';
import { FYRO_LOGO_URL } from '@/lib/brand';

/**
 * The public shell: a floating glass bar, centred over the page.
 *
 * The bar is not pinned to the window edges — it is a rounded capsule that
 * sits inset from the top with the page scrolling visibly beneath and
 * through it, which is what makes the glass read as glass rather than as a
 * tinted strip. Real translucency: a bone ground under a saturating
 * backdrop blur, with a hairline and shadow that deepen once the page
 * scrolls so the capsule lifts off the content passing under it.
 *
 * Below `md` it stays the phone shell — a compact capsule over the
 * five-tab bottom bar. From `md` up it carries the numbered monograph nav,
 * the language dial and the passbook entry.
 */

const NAV = [
  { href: '/how-it-works', num: '01', key: 'howItWorks' },
  { href: '/pricing', num: '02', key: 'pricing' },
  { href: '/safety', num: '03', key: 'safety' },
  { href: '/about', num: '04', key: 'about' },
  { href: '/faq', num: '05', key: 'faq' },
] as const;

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('marketing.layout');
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  /* Scroll fires dozens of times a second. This only ever needs to know
     which side of one threshold we are on, so the read is deferred to the
     next frame and state is only touched when the answer actually changes —
     otherwise React was being asked to reconcile the whole shell on every
     scroll event. */
  useEffect(() => {
    let frame = 0;
    let last = window.scrollY > 8;
    setScrolled(last);

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const next = window.scrollY > 8;
        if (next !== last) {
          last = next;
          setScrolled(next);
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Floating, centred, fully rounded. The outer bar is only a
          positioning frame — it stays transparent so the page shows
          through either side of the capsule. */}
      <header className="fixed top-0 inset-x-0 z-50 pointer-events-none">
        <div className="max-w-7xl mx-auto px-gutter lg:px-8 pt-3 md:pt-4">
          <div
            className={`pointer-events-auto rounded-full h-14 md:h-16 pl-3 pr-2 md:pl-5 md:pr-3 flex items-center justify-between gap-4 transition-all duration-base ${
              scrolled ? 'shadow-float' : 'shadow-card'
            }`}
            style={{
              background: scrolled ? 'rgba(253, 249, 240, 0.78)' : 'rgba(253, 249, 240, 0.62)',
              backdropFilter: 'blur(14px) saturate(1.35)',
              WebkitBackdropFilter: 'blur(14px) saturate(1.35)',
              contain: 'paint',
              boxShadow: scrolled
                ? 'inset 0 0 0 1px rgba(28,28,22,0.10), 0 10px 32px rgba(28,28,22,0.10)'
                : 'inset 0 0 0 1px rgba(28,28,22,0.07), 0 4px 18px rgba(28,28,22,0.05)',
            }}
          >
            {/* Brand crest */}
            <Link href="/" className="flex items-center gap-2.5 min-w-0 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={FYRO_LOGO_URL}
                alt=""
                width={40}
                height={40}
                className="w-9 h-9 md:w-10 md:h-10 rounded-full object-cover shrink-0"
              />
              <span className="flex flex-col min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-heading text-title text-fy-ink tracking-wide leading-none">FYRO</span>
                  <span className="hidden sm:inline font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded-tag bg-fy-lime-tint-1 text-fy-green border border-fy-lime/50 uppercase font-semibold">
                    {t('federatedChip')}
                  </span>
                </span>
                <span className="hidden md:block font-mono text-[10px] text-fy-muted tracking-wider mt-0.5 truncate">
                  {t('federationName')}
                </span>
              </span>
            </Link>

            {/* Numbered monograph nav */}
            <nav
              aria-label="Main"
              className="hidden lg:flex items-center gap-6 xl:gap-7 font-mono text-[11px] tracking-widest uppercase"
            >
              {NAV.map((l) => {
                const active = pathname === l.href;
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    aria-current={active ? 'page' : undefined}
                    className={`whitespace-nowrap transition-colors ${
                      active ? 'text-fy-brown font-semibold' : 'text-fy-muted hover:text-fy-brown'
                    }`}
                  >
                    {l.num} / {t(l.key)}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <LanguageDial size="sm" className="hidden sm:block" />

              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-4 md:px-5 h-10 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone font-mono text-[11px] font-semibold uppercase tracking-wider rounded-full shadow-card transition-colors"
              >
                <span>{t('passbook')}</span>
                <span aria-hidden className="material-symbols-outlined text-[15px] text-fy-lime">
                  arrow_outward
                </span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-20 md:pt-24 pb-24 md:pb-0">{children}</main>

      <div className="md:hidden">
        <BottomTabBar
          size="compact"
          items={[
            { href: '/', label: t('platform'), glyph: 'grid_view' },
            { href: '/how-it-works', label: t('howItWorks'), glyph: 'hub' },
            { href: '/pricing', label: t('pricing'), glyph: 'payments' },
            { href: '/about', label: t('about'), glyph: 'diversity_3' },
            { href: '/safety', label: t('safety'), glyph: 'verified_user' },
          ]}
        />
      </div>

      <footer className="bg-fy-panel border-t border-fy-brown/15 pt-20 pb-28 md:pb-16 px-gutter lg:px-12">
        <div className="max-w-7xl mx-auto flex flex-col gap-14">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12 border-b border-fy-brown/12 pb-12">
            <div className="lg:col-span-4 flex flex-col gap-3">
              <span className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={FYRO_LOGO_URL} alt="" width={36} height={36} className="w-9 h-9 rounded-full object-cover" />
                <span className="font-heading text-title text-fy-ink tracking-wide">{t('federationTitle')}</span>
              </span>
              <p className="font-body text-label text-fy-ink-soft max-w-sm">{t('federationBlurb')}</p>
            </div>

            <nav aria-label="Platform" className="lg:col-span-3 flex flex-col gap-2.5">
              <span className="font-mono text-[10px] text-fy-brown uppercase tracking-widest font-bold">
                {t('footerPlatform')}
              </span>
              {NAV.slice(0, 3).map((l) => (
                <Link key={l.href} href={l.href} className="font-body text-label text-fy-ink-soft hover:text-fy-ink transition-colors">
                  {t(l.key)}
                </Link>
              ))}
            </nav>

            <nav aria-label="Cooperative" className="lg:col-span-3 flex flex-col gap-2.5">
              <span className="font-mono text-[10px] text-fy-brown uppercase tracking-widest font-bold">
                {t('footerCooperative')}
              </span>
              {NAV.slice(3).map((l) => (
                <Link key={l.href} href={l.href} className="font-body text-label text-fy-ink-soft hover:text-fy-ink transition-colors">
                  {t(l.key)}
                </Link>
              ))}
              <Link href="/contact" className="font-body text-label text-fy-ink-soft hover:text-fy-ink transition-colors">
                {t('contact')}
              </Link>
              <Link href="/terms-of-service" className="font-body text-label text-fy-ink-soft hover:text-fy-ink transition-colors">
                {t('terms')}
              </Link>
            </nav>

            <div className="lg:col-span-2">
              <div className="p-4 bg-fy-card border border-fy-brown/15 rounded-cell text-center shadow-card">
                <span aria-hidden className="material-symbols-outlined text-2xl text-fy-green block mx-auto mb-1">
                  verified_user
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-fy-ink font-bold block">
                  {t('sealTitle')}
                </span>
                <span className="font-mono text-[8px] text-fy-muted block">{t('sealSub')}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px] text-fy-muted tracking-wider">
            <span>{t('copyright')}</span>
            <div className="flex gap-6">
              <Link href="/terms-of-service" className="hover:text-fy-brown transition-colors">
                {t('terms')}
              </Link>
              <Link href="/safety" className="hover:text-fy-brown transition-colors">
                {t('safety')}
              </Link>
              <Link href="/contact" className="hover:text-fy-brown transition-colors">
                {t('contact')}
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
