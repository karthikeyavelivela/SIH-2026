'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { HomeIcon, CalendarIcon, ClockIcon, UserIcon } from '@/components/ui/icons';

const tabs: TabItem[] = [
  { href: '/customer/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/customer/book', label: 'Book', icon: CalendarIcon },
  { href: '/customer/history', label: 'History', icon: ClockIcon },
  { href: '/customer/profile', label: 'Profile', icon: UserIcon },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || user.role !== 'customer')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'customer') {
    return <div className="min-h-screen flex items-center justify-center text-text-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {children}
      <BottomTabNav items={tabs} />
    </div>
  );
}
