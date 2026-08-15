'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import {
  UsersIcon,
  LayersIcon,
  AlertIcon,
  WalletIcon,
  TruckIcon,
  ChevronRightIcon,
} from '@/components/ui/icons';

interface AdminStats {
  activeBookings: number;
  gmv: number;
  openComplaints: number;
  totalCompletedBookings: number;
}

const LINKS = [
  { href: '/admin/users', label: 'Users', hint: 'Org tree, roles, suspend/delete', icon: UsersIcon },
  { href: '/admin/managers', label: 'Managers', hint: 'Create managers, scope permissions', icon: UsersIcon },
  { href: '/admin/fares', label: 'Fare rules', hint: 'Region × category rate cards', icon: LayersIcon },
  { href: '/admin/complaints', label: 'Complaints', hint: 'Resolution queue', icon: AlertIcon },
  { href: '/admin/incentives', label: 'Incentives', hint: 'Rating-threshold bonus rules', icon: WalletIcon },
  { href: '/admin/regions', label: 'Regions', hint: 'Enable/launch new regions', icon: LayersIcon },
];

function StatTile({ label, value, icon: Icon }: { label: string; value: string; icon: typeof TruckIcon }) {
  return (
    <Card elevation="raised" className="flex items-center gap-3">
      <span className="w-11 h-11 rounded-full bg-primary/10 text-primary-600 flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <div>
        <p className="font-heading text-xl font-bold leading-tight">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { data: stats } = usePolling(() => api.get<AdminStats>('/api/admin/stats'), 30000);

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">Console</p>
      <h1 className="font-heading text-2xl font-bold mb-1">Welcome, {user?.name?.split(' ')[0]}</h1>
      <p className="text-sm text-text-muted mb-8">Platform snapshot and everything you can manage.</p>

      <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mb-10">
        <StatTile label="Active bookings" value={String(stats?.activeBookings ?? '—')} icon={TruckIcon} />
        <StatTile label="GMV (completed)" value={stats ? `₹${stats.gmv}` : '—'} icon={WalletIcon} />
        <StatTile label="Open complaints" value={String(stats?.openComplaints ?? '—')} icon={AlertIcon} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card elevation="raised" className="flex items-center justify-between gap-3 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-base h-full">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full bg-primary/10 text-primary-600 flex items-center justify-center flex-shrink-0">
                  <l.icon className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{l.label}</p>
                  <p className="text-xs text-text-muted truncate">{l.hint}</p>
                </div>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-text-muted flex-shrink-0" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
