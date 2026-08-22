'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MetricCard } from '@/components/ui/MetricCard';
import { SupportAgentWidget, DemandForecastWidget } from '@/components/worker/AgentWidgets';
import {
  UsersIcon,
  LayersIcon,
  AlertIcon,
  WalletIcon,
  TruckIcon,
  ChevronRightIcon,
  ShieldIcon,
  CompassIcon,
  BoxIcon,
  BellIcon,
  ClockIcon,
} from '@/components/ui/icons';

interface AdminStats {
  activeBookings: number;
  gmv: number;
  openComplaints: number;
  totalCompletedBookings: number;
}

// Same data source as before this restyle (GET /api/admin/stats,
// unchanged) — only the presentation moved onto the ip-* tonal system
// (MetricCard/ip-card) to match the Stitch admin_dashboard/
// admin_dashboard_overview screens in DESIGN_INVENTORY.md, following
// client/src/app/fleet-owner/dashboard/page.tsx as the structural
// reference for a dense SidebarNav + MetricCard console screen.
const LINK_META = [
  { href: '/admin/kyc-queue', key: 'kycQueue', icon: ShieldIcon, perm: 'verify_kyc' },
  { href: '/admin/disputes', key: 'disputes', icon: AlertIcon, perm: 'admin' },
  { href: '/admin/fraud-alerts', key: 'fraudAlerts', icon: ShieldIcon, perm: 'admin' },
  { href: '/admin/payouts', key: 'payouts', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/ledger', key: 'ledger', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/surge-zones', key: 'surgeZones', icon: CompassIcon, perm: 'edit_fare_rules' },
  { href: '/admin/analytics', key: 'analytics', icon: LayersIcon, perm: 'view_analytics' },
  { href: '/admin/ops-hub', key: 'opsHub', icon: BellIcon, perm: 'view_analytics' },
  { href: '/admin/reports', key: 'reports', icon: BoxIcon, perm: 'admin' },
  { href: '/admin/users', key: 'users', icon: UsersIcon, perm: 'admin' },
  { href: '/admin/managers', key: 'managers', icon: UsersIcon, perm: 'admin' },
  { href: '/admin/fares', key: 'fares', icon: LayersIcon, perm: 'edit_fare_rules' },
  { href: '/admin/complaints', key: 'complaints', icon: AlertIcon, perm: 'resolve_complaints' },
  { href: '/admin/incentives', key: 'incentives', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/regions', key: 'regions', icon: CompassIcon, perm: 'admin' },
  { href: '/admin/audit-log', key: 'auditLog', icon: ClockIcon, perm: 'admin' },
] as const;

export default function AdminDashboardPage() {
  const t = useTranslations('adminDashboard');
  const tLinks = useTranslations('adminDashboard.links');
  const { user } = useAuth();
  const { data: stats } = usePolling(() => api.get<AdminStats>('/api/admin/stats'), 30000);
  const isAdmin = user?.role === 'admin';
  const permissions = user?.permissions ?? [];
  const ALL_LINKS = LINK_META.map((l) => ({
    ...l,
    label: tLinks(`${l.key}.label`),
    hint: tLinks(`${l.key}.hint`),
  }));
  const links = ALL_LINKS.filter((l) => (l.perm === 'admin' ? isAdmin : isAdmin || permissions.includes(l.perm)));

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('welcome', { name: user?.name?.split(' ')[0] ?? '' })}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-8">{t('subtitle')}</p>

      <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mb-10">
        <MetricCard label={t('activeBookings')} value={stats?.activeBookings ?? '—'} icon={<TruckIcon className="w-5 h-5" />} />
        <MetricCard label={t('gmv')} value={stats ? `₹${stats.gmv}` : '—'} icon={<WalletIcon className="w-5 h-5" />} />
        <MetricCard label={t('openComplaints')} value={stats?.openComplaints ?? '—'} icon={<AlertIcon className="w-5 h-5" />} />
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <div className="ip-card flex items-center justify-between gap-3 h-full hover:bg-ip-surface-container-high transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full bg-ip-primary-container/20 text-ip-primary flex items-center justify-center flex-shrink-0">
                  <l.icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{l.label}</p>
                  <p className="text-xs text-ip-on-surface-variant truncate">{l.hint}</p>
                </div>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-ip-outline flex-shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 max-w-lg">
        <DemandForecastWidget region={user?.region} accent="primary" />
        <SupportAgentWidget accent="primary" />
      </div>
    </div>
  );
}
