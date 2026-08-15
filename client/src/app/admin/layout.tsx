'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/managers', label: 'Managers' },
  { href: '/admin/fares', label: 'Fares' },
  { href: '/admin/complaints', label: 'Complaints' },
  { href: '/admin/incentives', label: 'Incentives' },
  { href: '/admin/regions', label: 'Regions' },
  { href: '/admin/audit-log', label: 'Audit log' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Admin is a desktop-first console by design (dense tables/tree views),
  // but it had literally zero navigation below the md breakpoint — the
  // sidebar was `hidden md:flex` with no mobile fallback at all, so an
  // admin/manager on a phone landed on a page with no way to move between
  // sections or log out. This mobile drawer is that fallback, not a
  // redesign of the desktop layout.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading || !user || user.role !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-text-muted bg-background">
        <div
          className="w-8 h-8 rounded-full border-2 border-border-strong border-t-primary-600 animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  const navLinks = (onNavigate?: () => void) => (
    <nav className="flex flex-col gap-1 text-sm">
      {NAV_ITEMS.map((item) => {
        const active = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`px-3.5 py-2.5 rounded-md font-medium transition-colors duration-fast ${
              active
                ? 'bg-primary-600/10 text-primary-600 shadow-sm'
                : 'text-text-muted hover:bg-surface hover:text-text-primary'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 border-r border-border bg-surface-raised shadow-sm p-6 hidden md:flex md:flex-col">
        <div className="mb-10">
          <p className="font-heading font-bold text-lg text-primary-600 tracking-tight">FYRO</p>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted mt-0.5">
            Admin console
          </p>
        </div>
        {navLinks()}
        <div className="mt-auto pt-6 border-t border-border">
          <p className="text-xs text-text-muted truncate mb-3">
            Signed in as <span className="font-semibold text-text-primary">{user.name}</span>
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-fast"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-surface-raised border-b border-border shadow-sm">
        <p className="font-heading font-bold text-primary-600">FYRO Admin</p>
        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-surface transition-colors duration-fast"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileNavOpen ? <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /> : <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
      {mobileNavOpen && (
        <div className="md:hidden fixed top-[57px] inset-x-0 z-30 bg-surface-raised border-b border-border shadow-lg px-4 py-4 animate-[fadeIn_200ms_ease-out]">
          {navLinks(() => setMobileNavOpen(false))}
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 mt-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-fast border-t border-border pt-4"
          >
            Log out
          </button>
        </div>
      )}

      <main className="flex-1 p-6 md:p-10 pt-20 md:pt-10 animate-[fadeIn_300ms_ease-out]">{children}</main>
    </div>
  );
}
