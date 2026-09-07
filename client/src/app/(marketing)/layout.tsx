'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { LanguagePill, type LanguageCode } from '@/components/ui/LanguagePill';
import { BottomTabBar } from '@/components/fy/Navigation';
import { setLocaleAction } from '@/i18n/setLocale';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('marketing.layout');
  const locale = useLocale() as LanguageCode;
  const router = useRouter();
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
      {/* Flat 64px bar on the page background, per the design's landing
          header — not the floating pill this used to be. The wordmark keeps
          its "Cooperative" eyebrow, the language switcher sits inline as the
          EN / తె / हि group, and the avatar is the login entry point. */}
      <header className="fixed top-0 inset-x-0 z-40 bg-fy-bone/88 backdrop-blur-xl shadow-[0_1px_12px_rgba(28,28,22,0.04)]">
        <div className="h-16 max-w-2xl mx-auto px-gutter flex items-center justify-between gap-3">
          <Link href="/" className="flex flex-col leading-none min-w-0">
            <span className="font-heading text-title text-fy-brown tracking-tight">FYRO</span>
            <span className="font-body text-eyebrow uppercase tracking-[0.08em] text-fy-muted mt-0.5">
              {t('brandSub')}
            </span>
          </Link>
          <div className="flex items-center gap-2 shrink-0">
            {/* Same setLocaleAction + router.refresh loop as before, now in
                the design's inline EN / తె / हि group. */}
            <LanguagePill
              size="compact"
              value={locale}
              onChange={handleLocaleChange}
              className={`transition-opacity duration-base ${isPending ? 'opacity-60' : ''}`}
            />
            <Link
              href="/login"
              aria-label={t('login')}
              className="w-9 h-9 rounded-full bg-fy-brown-soft text-fy-on-brown flex items-center justify-center ring-2 ring-fy-field active:scale-95 transition-transform"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z" />
              </svg>
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1 pt-16 pb-24">{children}</main>
      {/* 64px five-tab bar, per the design. FAQ and Contact aren't in it —
          they stay reachable through the footer below, which is the only
          route to them on a phone now that the burger menu is gone. */}
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
      <footer className="border-t border-fy-hairline bg-fy-panel mt-16">
        <div className="max-w-6xl mx-auto px-6 pt-14 pb-28 flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <span className="font-heading text-lg font-extrabold text-fy-brown tracking-tight">FYRO</span>
            <p className="mt-2 text-sm text-fy-muted">{t('copyright')}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-fy-muted">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-fy-ink transition-colors duration-base">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
