'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { SessionGate } from '@/components/auth/SessionGate';
import { WorkerTabBar } from '@/components/fy/RoleNav';

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const t = useTranslations('nav');

  // Signed out -> /login; signed in as another role -> that role's home.
  useRoleGuard(['driver']);

  if (loading || !user || user.role !== 'driver') {
    return <SessionGate />;
  }

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      {children}
      <WorkerTabBar base="/driver" />
    </div>
  );
}
