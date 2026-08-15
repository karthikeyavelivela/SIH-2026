'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { TruckIcon, WalletIcon, UserIcon } from '@/components/ui/icons';

const tabs: TabItem[] = [
  { href: '/mutha-member/job', label: 'Job', icon: TruckIcon },
  { href: '/mutha-member/earnings', label: 'Earnings', icon: WalletIcon },
  { href: '/mutha-member/profile', label: 'Profile', icon: UserIcon },
];

export default function MuthaMemberLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'mutha_member')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'mutha_member') {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {children}
      <BottomTabNav items={tabs} />
    </div>
  );
}
