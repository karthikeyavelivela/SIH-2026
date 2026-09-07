'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { SidebarNav } from '@/components/admin/SidebarNav';
import { BoxIcon, HomeIcon, UsersIcon } from '@/components/ui/icons';
import { NotificationBell } from '@/components/ui/NotificationBell';

// Dense-data desk surface for the warehouse_hub role — mirrors
// client/src/app/admin/layout.tsx exactly (desktop SidebarNav + mobile
// hamburger drawer), same rationale as client/src/app/fleet-owner/layout.tsx.
export default function WarehouseHubLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('consoleLayout');
  const NAV_ITEMS = [
    { href: '/warehouse-hub/dashboard', label: t('dashboard'), icon: <HomeIcon className="w-5 h-5" /> },
    { href: '/warehouse-hub/profile', label: t('profile'), icon: <UsersIcon className="w-5 h-5" /> },
  ];
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== 'warehouse_hub')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  if (loading || !user || user.role !== 'warehouse_hub') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-fy-ink-soft bg-fy-bone">
        <div className="w-8 h-8 rounded-full border-2 border-fy-hairline border-t-fy-brown animate-spin" aria-hidden="true" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-fy-bone text-fy-ink">
      <aside className="w-64 shrink-0 border-r border-fy-muted/10 bg-fy-card p-6 hidden md:flex md:flex-col">
        <div className="mb-10 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full bg-fy-lime/30 text-fy-green flex items-center justify-center flex-shrink-0">
              <BoxIcon className="w-5 h-5" />
            </span>
            <div>
              <p className="font-heading font-bold text-lg text-fy-brown tracking-tight leading-none">FYRO</p>
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-fy-ink-soft mt-0.5">
                {t('hubConsole')}
              </p>
            </div>
          </div>
          <NotificationBell href="/warehouse-hub/notifications" />
        </div>
        <SidebarNav items={NAV_ITEMS} />
        <div className="mt-auto pt-6 border-t border-fy-muted/10">
          <p className="text-xs text-fy-ink-soft truncate mb-3">
            {t('signedInAs')} <span className="font-semibold text-fy-ink">{user.name}</span>
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 rounded-control text-sm font-medium text-fy-error hover:bg-fy-error-bg/40 transition-colors"
          >
            {t('logout')}
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-fy-card border-b border-fy-muted/10 shadow-sm">
        <p className="font-heading font-bold text-fy-brown">{t('fyroHub')}</p>
        <div className="flex items-center gap-1">
        <NotificationBell href="/warehouse-hub/notifications" />
        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={mobileNavOpen ? t('closeMenu') : t('openMenu')}
          aria-expanded={mobileNavOpen}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-fy-field transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileNavOpen ? <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /> : <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />}
          </svg>
        </button>
        </div>
      </div>
      {mobileNavOpen && (
        <div className="md:hidden fixed top-[57px] inset-x-0 z-30 bg-fy-card border-b border-fy-muted/10 shadow-lg px-4 py-4 animate-[fadeIn_200ms_ease-out]">
          <SidebarNav items={NAV_ITEMS} />
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 mt-2 rounded-control text-sm font-medium text-fy-error hover:bg-fy-error-bg/40 transition-colors border-t border-fy-muted/10 pt-4"
          >
            {t('logout')}
          </button>
        </div>
      )}

      <main className="flex-1 min-w-0 p-6 md:p-10 pt-20 md:pt-10 animate-[fadeIn_300ms_ease-out]">{children}</main>
    </div>
  );
}
