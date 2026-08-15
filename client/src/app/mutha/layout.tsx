'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { HomeIcon, LayersIcon, UsersIcon, WalletIcon, TruckIcon, UserIcon } from '@/components/ui/icons';

const tabs: TabItem[] = [
  { href: '/mutha/dashboard', label: 'Group', icon: HomeIcon },
  { href: '/mutha/requests', label: 'Requests', icon: LayersIcon },
  { href: '/mutha/active-jobs', label: 'Jobs', icon: TruckIcon },
  { href: '/mutha/members', label: 'Members', icon: UsersIcon },
  { href: '/mutha/earnings', label: 'Earnings', icon: WalletIcon },
  { href: '/mutha/profile', label: 'Profile', icon: UserIcon },
];

export default function MuthaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'mutha_leader')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'mutha_leader') {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {children}
      <BottomTabNav items={tabs} />
    </div>
  );
}
