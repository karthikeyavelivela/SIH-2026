'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { SocietyMemberTabBar } from '@/components/fy/RoleNav';

export default function MuthaMemberLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('nav');

  useEffect(() => {
    if (!loading && (!user || user.role !== 'mutha_member')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'mutha_member') {
    return <div className="min-h-screen flex items-center justify-center text-fy-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-fy-bone pb-24">
      {children}
      <SocietyMemberTabBar />
    </div>
  );
}
