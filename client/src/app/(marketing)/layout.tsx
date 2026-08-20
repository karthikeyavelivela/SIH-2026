'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { LanguagePill, type LanguageCode } from '@/components/ui/LanguagePill';
import { setLocaleAction } from '@/i18n/setLocale';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
      {/* Floating pill nav — sits above the hero rather than spanning edge
          to edge, so the hero's illustration reads as full-bleed behind it.
          Must be `fixed`, not `sticky`: sticky still reserves its own box
          height in normal flow, which left a solid page-background gap
          above the hero section (glaringly visible once the hero became a
          near-black video instead of a faint low-opacity decoration). Every
          marketing subpage already has pt-24 on its own content wrapper
          specifically to clear a floating header, confirming this was
          always the intended layout. */}
      <header className="fixed top-4 inset-x-0 z-40 px-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 rounded-full bg-surface-raised/90 backdrop-blur-md border border-border shadow-lg pl-5 pr-3 py-2.5">
          <Link
            href="/"
            className="font-heading text-lg font-extrabold text-primary-600 tracking-tight transition-transform duration-base ease-out-expo hover:scale-[1.03] flex items-center gap-1.5"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12h4M3 7h9M3 17h6" strokeLinecap="round" />
              <circle cx="19" cy="12" r="3" />
            </svg>
            FYRO
          </Link>
          <nav aria-label="Main" className="hidden lg:flex gap-6 text-sm font-medium text-text-muted">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="group relative py-1 transition-colors duration-base hover:text-text-primary"
              >
                {l.label}
                <span className="absolute left-0 -bottom-0.5 h-[2px] w-0 bg-primary-600 transition-all duration-base ease-out-expo group-hover:w-full" />
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {/* Compact language switcher — same setLocaleAction + router.refresh
                loop as the homepage hero (see client/src/app/(marketing)/page.tsx),
                just styled to fit inline in the pill nav instead of floating
                over a hero. */}
            <LanguagePill
              value={locale}
              onChange={handleLocaleChange}
              className={`hidden md:inline-flex bg-surface transition-opacity duration-base ${isPending ? 'opacity-60' : ''}`}
            />
            <Link
              href="/login"
              className="hidden sm:inline-flex text-sm font-semibold px-4 py-2 rounded-full text-text-primary hover:bg-surface transition-colors duration-base"
            >
              {t('login')}
            </Link>
            <Link
              href="/signup/customer"
              className="text-sm font-semibold px-4 py-2.5 rounded-full bg-primary-600 text-white shadow-sm hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-base"
            >
              {t('bookDelivery')}
            </Link>
            {/* Mobile-only nav toggle. The four content links (nav above) are
                hidden below md — this is the only way to reach them on a
                phone viewport, so it isn't optional chrome. */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="lg:hidden p-2 text-text-primary rounded-full hover:bg-surface transition-colors duration-base"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-panel"
              aria-label={mobileNavOpen ? t('closeMenu') : t('openMenu')}
            >
              {mobileNavOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
        {mobileNavOpen && (
          <nav
            id="mobile-nav-panel"
            aria-label="Main (mobile)"
            className="lg:hidden max-w-5xl mx-auto mt-2 rounded-2xl border border-border px-6 py-5 flex flex-col gap-1 text-base font-medium text-text-muted bg-surface-raised shadow-lg animate-[fadeIn_200ms_ease-out]"
          >
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileNavOpen(false)}
                className="py-3 px-2 rounded-md hover:bg-surface hover:text-text-primary transition-colors duration-base"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/login"
              onClick={() => setMobileNavOpen(false)}
              className="py-3 px-2 rounded-md hover:bg-surface hover:text-text-primary transition-colors duration-base sm:hidden"
            >
              {t('login')}
            </Link>
            <div className="pt-3 mt-2 border-t border-border md:hidden">
              <LanguagePill value={locale} onChange={handleLocaleChange} />
            </div>
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface mt-32">
        <div className="max-w-6xl mx-auto px-6 py-14 flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <span className="font-heading text-lg font-extrabold text-primary-600 tracking-tight">FYRO</span>
            <p className="mt-2 text-sm text-text-muted">{t('copyright')}</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-sm text-text-muted">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-primary transition-colors duration-base">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
