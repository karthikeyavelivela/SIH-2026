'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { SessionGate } from '@/components/auth/SessionGate';
import { SocietyMemberTabBar } from '@/components/fy/RoleNav';

export default function MuthaMemberLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const t = useTranslations('nav');

  // Signed out -> /login; signed in as another role -> that role's home.
  useRoleGuard(['mutha_member']);

  if (loading || !user || user.role !== 'mutha_member') {
    return <SessionGate />;
  }

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      {children}
      <SocietyMemberTabBar />
    </div>
  );
}
