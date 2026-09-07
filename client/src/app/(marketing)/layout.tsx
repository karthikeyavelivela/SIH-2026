'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { LanguagePill, type LanguageCode } from '@/components/ui/LanguagePill';
import { BottomTabBar } from '@/components/fy/Navigation';
import { setLocaleAction } from '@/i18n/setLocale';

/**
 * The public shell, responsive across the two marketing designs.
 *
 * On a phone it is the design's 64px bar over a five-tab bottom bar. From
 * `md` up it becomes the desktop header — wordmark, inline nav, language and
 * the two account actions — and the bottom bar is hidden, because a pointer
 * user has the full nav in the header and a thumb bar just eats viewport.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('marketing.layout');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const navLinks = [
    { href: '/how-it-works', label: t('howItWorks') },
    { href: '/pricing', label: t('pricing') },
    { href: '/safety', label: t('safety') },
    { href: '/faq', label: t('faq') },
    { href: '/about', label: t('about') },
    { href: '/contact', label: t('contact') },
  ];

  function handleLocaleChange(code: LanguageCode) {
    if (code === locale) return;
    startTransition(async () => {
      await setLocaleAction(code);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="fixed top-0 inset-x-0 z-40 bg-fy-bone/88 backdrop-blur-xl shadow-[0_1px_12px_rgba(28,28,22,0.04)]">
        <div className="h-16 max-w-6xl mx-auto px-gutter flex items-center justify-between gap-4">
          <Link href="/" className="flex flex-col leading-none min-w-0 shrink-0">
            <span className="font-heading text-title text-fy-brown tracking-tight">FYRO</span>
            <span className="font-body text-eyebrow uppercase tracking-[0.08em] text-fy-muted mt-0.5">
              {t('brandSub')}
            </span>
          </Link>

          {/* Desktop nav — the phone gets these through the bottom bar and
              the footer instead. */}
          <nav aria-label="Main" className="hidden md:flex items-center gap-1 min-w-0">
            {navLinks.map((l) => {
              const active = pathname === l.href;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? 'page' : undefined}
                  className={`px-3 py-2 rounded-full font-body text-label transition-colors ${
                    active ? 'bg-fy-field text-fy-ink font-semibold' : 'text-fy-ink-soft hover:text-fy-ink'
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <LanguagePill
              size="compact"
              value={locale}
              onChange={handleLocaleChange}
              className={`transition-opacity duration-base ${isPending ? 'opacity-60' : ''}`}
            />
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center h-9 px-4 rounded-full font-body text-label font-semibold text-fy-ink hover:bg-fy-field transition-colors"
            >
              {t('login')}
            </Link>
            <Link
              href="/signup/customer"
              className="hidden md:inline-flex items-center h-9 px-4 rounded-full bg-fy-green text-fy-on-green font-body text-label font-semibold hover:brightness-110 transition-all"
            >
              {t('bookDelivery')}
            </Link>
            <Link
              href="/login"
              aria-label={t('login')}
              className="sm:hidden w-9 h-9 rounded-full bg-fy-brown-soft text-fy-on-brown flex items-center justify-center ring-2 ring-fy-field"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16 pb-24 md:pb-0">{children}</main>

      {/* Phone only: a pointer user already has every link in the header. */}
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

      <footer className="border-t border-fy-hairline bg-fy-panel mt-16">
        <div className="max-w-6xl mx-auto px-gutter pt-14 pb-28 md:pb-14 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <span className="font-heading text-title text-fy-brown tracking-tight">FYRO</span>
            <p className="font-body text-eyebrow uppercase tracking-[0.08em] text-fy-muted mt-1">
              {t('federationName')}
            </p>
            <p className="font-body text-label text-fy-ink-soft mt-3 max-w-xs">{t('federationBlurb')}</p>
            <p className="font-body text-label text-fy-muted mt-4">{t('copyright')}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-col gap-2.5">
            <p className="font-body text-eyebrow uppercase tracking-[0.08em] text-fy-muted">{t('footerPlatform')}</p>
            {navLinks.slice(0, 3).map((l) => (
              <Link key={l.href} href={l.href} className="font-body text-label text-fy-ink-soft hover:text-fy-ink transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Footer, more" className="flex flex-col gap-2.5">
            <p className="font-body text-eyebrow uppercase tracking-[0.08em] text-fy-muted">{t('footerCooperative')}</p>
            {navLinks.slice(3).map((l) => (
              <Link key={l.href} href={l.href} className="font-body text-label text-fy-ink-soft hover:text-fy-ink transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
