'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { SidebarNav } from '@/components/admin/SidebarNav';
import { BoxIcon, HomeIcon, UsersIcon } from '@/components/ui/icons';

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
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-ip-on-surface-variant bg-ip-surface">
        <div className="w-8 h-8 rounded-full border-2 border-ip-outline-variant border-t-ip-primary animate-spin" aria-hidden="true" />
        <p className="text-sm">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-ip-surface text-ip-on-surface">
      <aside className="w-64 shrink-0 border-r border-ip-outline/10 bg-ip-surface-container-lowest p-6 hidden md:flex md:flex-col">
        <div className="mb-10 flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full bg-ip-secondary-container/30 text-ip-secondary flex items-center justify-center flex-shrink-0">
            <BoxIcon className="w-5 h-5" />
          </span>
          <div>
            <p className="font-heading font-bold text-lg text-ip-primary tracking-tight leading-none">FYRO</p>
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ip-on-surface-variant mt-0.5">
              {t('hubConsole')}
            </p>
          </div>
        </div>
        <SidebarNav items={NAV_ITEMS} />
        <div className="mt-auto pt-6 border-t border-ip-outline/10">
          <p className="text-xs text-ip-on-surface-variant truncate mb-3">
            {t('signedInAs')} <span className="font-semibold text-ip-on-surface">{user.name}</span>
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 rounded-ip-input text-sm font-medium text-ip-error hover:bg-ip-error-container/40 transition-colors"
          >
            {t('logout')}
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-ip-surface-container-lowest border-b border-ip-outline/10 shadow-sm">
        <p className="font-heading font-bold text-ip-primary">{t('fyroHub')}</p>
        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={mobileNavOpen ? t('closeMenu') : t('openMenu')}
          aria-expanded={mobileNavOpen}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-ip-surface-container transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileNavOpen ? <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /> : <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />}
          </svg>
        </button>
      </div>
      {mobileNavOpen && (
        <div className="md:hidden fixed top-[57px] inset-x-0 z-30 bg-ip-surface-container-lowest border-b border-ip-outline/10 shadow-lg px-4 py-4 animate-[fadeIn_200ms_ease-out]">
          <SidebarNav items={NAV_ITEMS} />
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 mt-2 rounded-ip-input text-sm font-medium text-ip-error hover:bg-ip-error-container/40 transition-colors border-t border-ip-outline/10 pt-4"
          >
            {t('logout')}
          </button>
        </div>
      )}

      <main className="flex-1 min-w-0 p-6 md:p-10 pt-20 md:pt-10 animate-[fadeIn_300ms_ease-out]">{children}</main>
    </div>
  );
}
