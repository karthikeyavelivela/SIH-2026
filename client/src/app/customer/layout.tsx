'use client';


import { useAuth } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { SessionGate } from '@/components/auth/SessionGate';
import { CustomerTabBar } from '@/components/fy/CustomerTabBar';


export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();


  // Real Stitch screens (fyro_household_home, fyro_hamali_labour_standard,
  // fyro_goods_transport, fyro_booking_history_1, fyro_customer_profile_1)
  // all share this exact 5-tab nav — Household/Hamali/Transit/Passbook/
  // Profile — replacing the old generic Home/Book/History/Profile. Book
  // itself is no longer one tab: household IS the home tab (the dial's
  // 3rd, default sector), and labour/transport get their own dedicated
  // routes+tabs matching their own separate Stitch screens.

  // Signed out -> /login; signed in as another role -> that role's home.
  useRoleGuard(['customer']);

  if (loading || !user || user.role !== 'customer') {
    return <SessionGate />;
  }

  return (
    <div className="min-h-screen bg-fy-bone fy-pad-nav">
      {children}
      <CustomerTabBar />
    </div>
  );
}
