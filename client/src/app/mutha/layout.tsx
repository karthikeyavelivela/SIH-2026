'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { HomeIcon, LayersIcon, UsersIcon, WalletIcon, TruckIcon, UserIcon } from '@/components/ui/icons';

export default function MuthaLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('nav');

  const tabs: TabItem[] = [
    { href: '/mutha/dashboard', label: t('group'), icon: HomeIcon },
    { href: '/mutha/requests', label: t('requests'), icon: LayersIcon },
    { href: '/mutha/active-jobs', label: t('jobs'), icon: TruckIcon },
    { href: '/mutha/members', label: t('members'), icon: UsersIcon },
    { href: '/mutha/earnings', label: t('earnings'), icon: WalletIcon },
    { href: '/mutha/profile', label: t('profile'), icon: UserIcon },
  ];

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
