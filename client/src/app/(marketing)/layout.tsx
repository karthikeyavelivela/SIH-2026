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
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="font-heading text-xl font-bold text-primary">
            FYRO
          </Link>
          <nav aria-label="Main" className="hidden md:flex gap-6 text-sm text-text-muted">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-primary transition">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-medium px-4 py-2 rounded-full hover:bg-surface transition">
              Log in
            </Link>
            {/* Mobile-only nav toggle. The four content links (nav above) are
                hidden below md — this is the only way to reach them on a
                phone viewport, so it isn't optional chrome. */}
            <button
              type="button"
              onClick={() => setMobileNavOpen((open) => !open)}
              className="md:hidden p-2 -mr-2 text-text-primary"
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
            className="md:hidden border-t border-black/5 px-6 py-4 flex flex-col gap-4 text-sm text-text-muted bg-background"
          >
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMobileNavOpen(false)}
                className="hover:text-text-primary transition"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-black/5 py-10 mt-20">
        <div className="max-w-6xl mx-auto px-6 text-sm text-text-muted flex flex-wrap justify-between gap-4">
          <span>© 2026 FYRO. Andhra Pradesh.</span>
          <nav aria-label="Footer" className="flex gap-6">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-text-primary transition">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
