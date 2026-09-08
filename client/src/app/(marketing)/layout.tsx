'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { type LanguageCode } from '@/components/ui/LanguagePill';
import { BottomTabBar } from '@/components/fy/Navigation';
import { setLocaleAction } from '@/i18n/setLocale';

/**
 * The public shell: a glass executive bar over the page, responsive across
 * the two marketing designs.
 *
 * Below `md` it stays the phone shell — a compact bar over the five-tab
 * bottom bar. From `md` up it becomes the desktop header from the design:
 * brand crest with its charter line, numbered monograph nav, the three-way
 * language switcher, a live telemetry node and the passbook entry.
 *
 * The glass is real rather than a flat tint: a translucent bone ground under
 * a saturating backdrop blur, with a hairline that strengthens once the page
 * scrolls so the bar separates from content passing beneath it.
 */

const NAV = [
  { href: '/how-it-works', num: '01', key: 'howItWorks' },
  { href: '/pricing', num: '02', key: 'pricing' },
  { href: '/safety', num: '03', key: 'safety' },
  { href: '/about', num: '04', key: 'about' },
  { href: '/faq', num: '05', key: 'faq' },
] as const;

const LOCALES: { code: LanguageCode; short: string }[] = [
  { code: 'en', short: 'EN' },
  { code: 'te', short: 'తెలుగు' },
  { code: 'hi', short: 'हिन्दी' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('marketing.layout');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function handleLocaleChange(code: LanguageCode) {
    if (code === locale) return;
    startTransition(async () => {
      await setLocaleAction(code);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-base ${
          scrolled ? 'border-b border-fy-brown/12 shadow-[0_1px_20px_rgba(28,28,22,0.06)]' : 'border-b border-transparent'
        }`}
        style={{
          background: 'rgba(253, 249, 240, 0.72)',
          backdropFilter: 'blur(20px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        }}
      >
        <div className="max-w-7xl mx-auto px-gutter lg:px-12 h-16 md:h-20 flex items-center justify-between gap-4">
          {/* Brand crest + statutory charter line */}
          <Link href="/" className="group flex items-center gap-3 min-w-0 shrink-0">
            <span className="relative w-10 h-10 rounded-cell bg-fy-brown flex items-center justify-center shadow-card">
              <span className="font-heading font-bold text-title text-fy-lime tracking-tighter leading-none">FY</span>
              <span
                aria-hidden
                className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-fy-lime ring-2 ring-fy-bone"
              />
            </span>
            <span className="flex flex-col min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-heading text-title text-fy-ink tracking-wide leading-none">FYRO</span>
                <span className="hidden sm:inline font-mono text-[9px] tracking-widest px-1.5 py-0.5 rounded-tag bg-fy-lime-tint-1 text-fy-green border border-fy-lime/50 uppercase font-semibold">
                  {t('federatedChip')}
                </span>
              </span>
              <span className="hidden sm:block font-mono text-[10px] text-fy-muted tracking-wider mt-0.5 truncate">
                {t('federationName')}
              </span>
            </span>
          </Link>

          {/* Numbered monograph nav */}
          <nav aria-label="Main" className="hidden lg:flex items-center gap-7 font-mono text-[11px] tracking-widest uppercase">
            {NAV.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={`whitespace-nowrap transition-colors ${active ? 'text-fy-brown font-semibold' : 'text-fy-muted hover:text-fy-brown'}`}
                >
                  {l.num} / {t(l.key)}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Three-way language switcher */}
            <div
              className={`hidden xl:flex items-center gap-0.5 font-mono text-[11px] px-1.5 py-1 rounded-cell border border-fy-brown/12 transition-opacity ${
                isPending ? 'opacity-60' : ''
              }`}
              style={{ background: 'rgba(255,255,255,0.6)' }}
              role="radiogroup"
              aria-label="Select language"
            >
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={locale === l.code}
                  onClick={() => handleLocaleChange(l.code)}
                  className={`px-2 py-0.5 rounded-tag transition-colors ${
                    locale === l.code ? 'bg-fy-card text-fy-ink font-semibold shadow-card' : 'text-fy-muted hover:text-fy-ink'
                  }`}
                >
                  {l.short}
                </button>
              ))}
            </div>

            {/* Live telemetry node — a real heartbeat, not a decoration: it
                reflects that the public stats endpoint is answering. */}
            <span
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-cell border border-fy-brown/12 font-mono text-[11px] shadow-card"
              style={{ background: 'rgba(255,255,255,0.6)' }}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fy-lime opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-fy-green" />
              </span>
              <span className="text-fy-muted font-medium tracking-wide">{t('liveNode')}</span>
            </span>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-4 h-10 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone font-mono text-[11px] font-semibold uppercase tracking-wider rounded-cell shadow-card transition-colors"
            >
              <span>{t('passbook')}</span>
              <span aria-hidden className="material-symbols-outlined text-[15px] text-fy-lime">
                arrow_outward
              </span>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16 md:pt-20 pb-24 md:pb-0">{children}</main>

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
                <span className="w-8 h-8 rounded-cell bg-fy-brown flex items-center justify-center font-heading text-fy-lime font-bold">
                  FY
                </span>
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
