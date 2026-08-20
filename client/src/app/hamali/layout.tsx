'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { HomeIcon, LayersIcon, WalletIcon, UserIcon } from '@/components/ui/icons';

export default function HamaliLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('nav');

  const tabs: TabItem[] = [
    { href: '/hamali/dashboard', label: t('home'), icon: HomeIcon },
    { href: '/hamali/requests', label: t('requests'), icon: LayersIcon },
    { href: '/hamali/earnings', label: t('earnings'), icon: WalletIcon },
    { href: '/hamali/profile', label: t('profile'), icon: UserIcon },
  ];

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
