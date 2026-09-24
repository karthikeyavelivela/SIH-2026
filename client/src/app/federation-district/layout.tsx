'use client';

import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { SessionGate } from '@/components/auth/SessionGate';

export default function FederationDistrictLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  // Signed out -> /login; signed in as another role -> that role's home.
  useRoleGuard(['federation_district_admin']);

  if (loading || !user || user.role !== 'federation_district_admin') {
    return <SessionGate />;
  }

  return <div className="min-h-screen bg-fy-bone">{children}</div>;
}
