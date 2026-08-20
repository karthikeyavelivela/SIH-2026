'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MetricCard } from '@/components/ui/MetricCard';
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
const ALL_LINKS = [
  { href: '/admin/kyc-queue', label: 'KYC queue', hint: 'Approve or reject pending submissions', icon: ShieldIcon, perm: 'verify_kyc' },
  { href: '/admin/disputes', label: 'Disputes', hint: 'Claim vs system-record resolution', icon: AlertIcon, perm: 'admin' },
  { href: '/admin/fraud-alerts', label: 'Fraud alerts', hint: 'Severity-ranked case queue', icon: ShieldIcon, perm: 'admin' },
  { href: '/admin/payouts', label: 'Payouts', hint: 'Approve driver/Mutha payout requests', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/ledger', label: 'Ledger', hint: 'Platform transaction ledger', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/surge-zones', label: 'Surge zones', hint: 'Demand-surge overrides', icon: CompassIcon, perm: 'edit_fare_rules' },
  { href: '/admin/analytics', label: 'Analytics', hint: 'KPIs, heatmap, revenue trend', icon: LayersIcon, perm: 'view_analytics' },
  { href: '/admin/ops-hub', label: 'Ops hub', hint: 'Live incident dashboard', icon: BellIcon, perm: 'view_analytics' },
  { href: '/admin/reports', label: 'Reports', hint: 'Custom exports', icon: BoxIcon, perm: 'admin' },
  { href: '/admin/users', label: 'Users', hint: 'Org tree, roles, suspend/delete', icon: UsersIcon, perm: 'admin' },
  { href: '/admin/managers', label: 'Managers', hint: 'Create managers, scope permissions', icon: UsersIcon, perm: 'admin' },
  { href: '/admin/fares', label: 'Fare rules', hint: 'Region × category rate cards', icon: LayersIcon, perm: 'edit_fare_rules' },
  { href: '/admin/complaints', label: 'Complaints', hint: 'Resolution queue', icon: AlertIcon, perm: 'resolve_complaints' },
  { href: '/admin/incentives', label: 'Incentives', hint: 'Rating-threshold bonus rules', icon: WalletIcon, perm: 'admin' },
  { href: '/admin/regions', label: 'Regions', hint: 'Enable/launch new regions', icon: CompassIcon, perm: 'admin' },
  { href: '/admin/audit-log', label: 'Audit log', hint: 'Immutable action history', icon: ClockIcon, perm: 'admin' },
];

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { data: stats } = usePolling(() => api.get<AdminStats>('/api/admin/stats'), 30000);
  const isAdmin = user?.role === 'admin';
  const permissions = user?.permissions ?? [];
  const links = ALL_LINKS.filter((l) => (l.perm === 'admin' ? isAdmin : isAdmin || permissions.includes(l.perm)));

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Console</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Welcome, {user?.name?.split(' ')[0]}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-8">Platform snapshot and everything you can manage.</p>

      <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mb-10">
        <MetricCard label="Active bookings" value={stats?.activeBookings ?? '—'} icon={<TruckIcon className="w-5 h-5" />} />
        <MetricCard label="GMV (completed)" value={stats ? `₹${stats.gmv}` : '—'} icon={<WalletIcon className="w-5 h-5" />} />
        <MetricCard label="Open complaints" value={stats?.openComplaints ?? '—'} icon={<AlertIcon className="w-5 h-5" />} />
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
    </div>
  );
}
