'use client';

import { useState } from 'react';
import Link from 'next/link';

const navLinks = [
  { href: '/how-it-works', label: 'How it works' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b border-border shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4 md:py-5">
          <Link
            href="/"
            className="font-heading text-xl font-extrabold text-primary-600 tracking-tight transition-transform duration-base ease-out-expo hover:scale-[1.03]"
          >
            FYRO
          </Link>
          <nav aria-label="Main" className="hidden md:flex gap-8 text-sm font-medium text-text-muted">
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
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-semibold px-4 py-2 rounded-full text-text-primary hover:bg-surface transition-colors duration-base"
            >
              Log in
            </Link>
            {/* Mobile-only nav toggle. The four content links (nav above) are
                hidden below md — this is the only way to reach them on a
                phone viewport, so it isn't optional chrome. */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="md:hidden p-2 -mr-2 text-text-primary rounded-md hover:bg-surface transition-colors duration-base"
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-nav-panel"
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
            >
              {mobileNavOpen ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            className="md:hidden border-t border-border px-6 py-5 flex flex-col gap-1 text-base font-medium text-text-muted bg-surface-raised shadow-lg animate-[fadeIn_200ms_ease-out]"
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
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface mt-32">
        <div className="max-w-6xl mx-auto px-6 py-14 flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          <div>
            <span className="font-heading text-lg font-extrabold text-primary-600 tracking-tight">FYRO</span>
            <p className="mt-2 text-sm text-text-muted">© 2026 FYRO. Andhra Pradesh.</p>
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
