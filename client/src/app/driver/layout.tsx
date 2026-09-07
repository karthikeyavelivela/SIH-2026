'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { WorkerTabBar } from '@/components/fy/RoleNav';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    if (!loading && (!user || user.role !== 'driver')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'driver') {
    return <div className="min-h-screen flex items-center justify-center text-fy-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-fy-bone pb-24">
      {children}
      <WorkerTabBar base="/driver" />
    </div>
  );
}
