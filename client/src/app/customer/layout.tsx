'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { HomeIcon, CalendarIcon, ClockIcon, UserIcon } from '@/components/ui/icons';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('nav');

  const tabs: TabItem[] = [
    { href: '/customer/dashboard', label: t('home'), icon: HomeIcon },
    { href: '/customer/book', label: t('book'), icon: CalendarIcon },
    { href: '/customer/history', label: t('history'), icon: ClockIcon },
    { href: '/customer/profile', label: t('profile'), icon: UserIcon },
  ];

  useEffect(() => {
    if (!loading && (!user || user.role !== 'customer')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'customer') {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-ip-surface pb-24">
      {children}
      <BottomTabNav items={tabs} />
    </div>
  );
}
