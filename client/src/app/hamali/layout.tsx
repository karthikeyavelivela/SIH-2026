'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { HomeIcon, LayersIcon, WalletIcon, UserIcon } from '@/components/ui/icons';

const tabs: TabItem[] = [
  { href: '/hamali/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/hamali/requests', label: 'Requests', icon: LayersIcon },
  { href: '/hamali/earnings', label: 'Earnings', icon: WalletIcon },
  { href: '/hamali/profile', label: 'Profile', icon: UserIcon },
];

export default function HamaliLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'hamali_solo')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'hamali_solo') {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {children}
      <BottomTabNav items={tabs} />
    </div>
  );
}
