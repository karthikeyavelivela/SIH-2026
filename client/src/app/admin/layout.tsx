'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/managers', label: 'Managers' },
  { href: '/admin/fares', label: 'Fares' },
  { href: '/admin/complaints', label: 'Complaints' },
  { href: '/admin/incentives', label: 'Incentives' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'admin')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

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

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 shrink-0 border-r border-border bg-surface-raised shadow-sm p-6 hidden md:flex md:flex-col">
        <div className="mb-10">
          <p className="font-heading font-bold text-lg text-primary-600 tracking-tight">FYRO</p>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted mt-0.5">
            Admin console
          </p>
        </div>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV_ITEMS.map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
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
        <div className="mt-auto pt-6 border-t border-border">
          <p className="text-xs text-text-muted truncate">Signed in as</p>
          <p className="text-sm font-semibold truncate">{user.name}</p>
        </div>
      </aside>
      <main className="flex-1 p-6 md:p-10 animate-[fadeIn_300ms_ease-out]">{children}</main>
    </div>
  );
}
