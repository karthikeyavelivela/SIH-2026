'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { SidebarNav, SidebarNavItem } from '@/components/admin/SidebarNav';
import {
  HomeIcon,
  UsersIcon,
  LayersIcon,
  AlertIcon,
  WalletIcon,
  ShieldIcon,
  CompassIcon,
  BoxIcon,
  BellIcon,
  ClockIcon,
} from '@/components/ui/icons';

// Restyled onto the ip-* tonal system (see client/src/app/globals.css /
// client/src/app/fleet-owner/layout.tsx for the structural sibling this
// mirrors) per DESIGN_INVENTORY.md's admin_dashboard/user_management/etc
// rows. This is also the fix for a real access bug: the admin console is
// the shared route group for BOTH admin and manager
// (DESIGN_INVENTORY.md: "Manager screens reuse the existing admin/ route
// group... scoped to operations-manager permissions") and roleHome.ts has
// always sent 'manager' here — but this layout previously hard-required
// role === 'admin', so every manager account was bounced straight back to
// /login the instant they signed in. Nav items are filtered per the RBAC
// rule "ungranted controls HIDDEN not disabled" — the server independently
// re-checks every permission on every request regardless of what this menu
// shows (see requirePermission in server/src/middleware/rbac.ts).
function navItems(
  role: string,
  permissions: string[],
  t: (key: string) => string
): SidebarNavItem[] {
  const isAdmin = role === 'admin';
  const has = (p: string) => isAdmin || permissions.includes(p);

  const items: (SidebarNavItem & { show: boolean })[] = [
    { href: '/admin/dashboard', label: t('dashboard'), icon: <HomeIcon className="w-5 h-5" />, show: true },
    { href: '/admin/kyc-queue', label: t('kycQueue'), icon: <ShieldIcon className="w-5 h-5" />, show: has('verify_kyc') },
    { href: '/admin/disputes', label: t('disputes'), icon: <AlertIcon className="w-5 h-5" />, show: isAdmin },
    {
      href: '/admin/fraud-alerts',
      label: t('fraudAlerts'),
      icon: <ShieldIcon className="w-5 h-5" />,
      show: isAdmin,
    },
    { href: '/admin/payouts', label: t('payouts'), icon: <WalletIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/insurance', label: t('insurance'), icon: <ShieldIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/ledger', label: t('ledger'), icon: <WalletIcon className="w-5 h-5" />, show: isAdmin },
    {
      href: '/admin/surge-zones',
      label: t('surgeZones'),
      icon: <CompassIcon className="w-5 h-5" />,
      show: has('edit_fare_rules'),
    },
    {
      href: '/admin/analytics',
      label: t('analytics'),
      icon: <LayersIcon className="w-5 h-5" />,
      show: has('view_analytics'),
    },
    {
      href: '/admin/ops-hub',
      label: t('opsHub'),
      icon: <BellIcon className="w-5 h-5" />,
      show: has('view_analytics'),
    },
    { href: '/admin/reports', label: t('reports'), icon: <BoxIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/users', label: t('users'), icon: <UsersIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/managers', label: t('managers'), icon: <UsersIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/fares', label: t('fares'), icon: <LayersIcon className="w-5 h-5" />, show: has('edit_fare_rules') },
    {
      href: '/admin/complaints',
      label: t('complaints'),
      icon: <AlertIcon className="w-5 h-5" />,
      show: has('resolve_complaints'),
    },
    { href: '/admin/incentives', label: t('incentives'), icon: <WalletIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/regions', label: t('regions'), icon: <CompassIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/audit-log', label: t('auditLog'), icon: <ClockIcon className="w-5 h-5" />, show: isAdmin },
    { href: '/admin/profile', label: t('profile'), icon: <UsersIcon className="w-5 h-5" />, show: true },
  ];

  return items.filter((i) => i.show).map(({ show: _show, ...rest }) => rest);
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('adminLayout');
  const tNav = useTranslations('adminLayout.nav');
  const tLayout = useTranslations('consoleLayout');
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || (user.role !== 'admin' && user.role !== 'manager'))) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  const items = useMemo(
    () => (user ? navItems(user.role, user.permissions ?? [], tNav) : []),
    [user, tNav]
  );

  if (loading || !user || (user.role !== 'admin' && user.role !== 'manager')) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-ip-on-surface-variant bg-ip-surface">
        <div
          className="w-8 h-8 rounded-full border-2 border-ip-outline-variant border-t-ip-primary animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm">{tLayout('loading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-ip-surface text-ip-on-surface">
      <aside className="w-64 shrink-0 border-r border-ip-outline/10 bg-ip-surface-container-lowest p-6 hidden md:flex md:flex-col overflow-y-auto">
        <div className="mb-8">
          <p className="font-heading font-bold text-lg text-ip-primary tracking-tight">FYRO</p>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-ip-on-surface-variant mt-0.5">
            {user.role === 'admin' ? t('adminConsole') : t('managerConsole')}
          </p>
        </div>
        <SidebarNav items={items} />
        <div className="mt-auto pt-6 border-t border-ip-outline/10">
          <p className="text-xs text-ip-on-surface-variant truncate mb-3">
            {tLayout('signedInAs')} <span className="font-semibold text-ip-on-surface">{user.name}</span>
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 rounded-ip-input text-sm font-medium text-ip-error hover:bg-ip-error-container/40 transition-colors"
          >
            {tLayout('logout')}
          </button>
        </div>
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between px-4 py-3 bg-ip-surface-container-lowest border-b border-ip-outline/10 shadow-sm">
        <p className="font-heading font-bold text-ip-primary">
          FYRO {user.role === 'admin' ? t('admin') : t('manager')}
        </p>
        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={mobileNavOpen ? tLayout('closeMenu') : tLayout('openMenu')}
          aria-expanded={mobileNavOpen}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-ip-surface-container transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {mobileNavOpen ? (
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
            ) : (
              <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
            )}
          </svg>
        </button>
      </div>
      {mobileNavOpen && (
        <div className="md:hidden fixed top-[57px] inset-x-0 z-30 bg-ip-surface-container-lowest border-b border-ip-outline/10 shadow-lg px-4 py-4 max-h-[75vh] overflow-y-auto animate-[fadeIn_200ms_ease-out]">
          <SidebarNav items={items} />
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-3.5 py-2.5 mt-2 rounded-ip-input text-sm font-medium text-ip-error hover:bg-ip-error-container/40 transition-colors border-t border-ip-outline/10 pt-4"
          >
            {tLayout('logout')}
          </button>
        </div>
      )}

      <main className="flex-1 p-6 md:p-10 pt-20 md:pt-10 animate-[fadeIn_300ms_ease-out]">{children}</main>
    </div>
  );
}
