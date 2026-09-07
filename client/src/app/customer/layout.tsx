'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/lib/auth-context';
import { CustomerTabBar } from '@/components/fy/CustomerTabBar';


export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();


  // Real Stitch screens (fyro_household_home, fyro_hamali_labour_standard,
  // fyro_goods_transport, fyro_booking_history_1, fyro_customer_profile_1)
  // all share this exact 5-tab nav — Household/Hamali/Transit/Passbook/
  // Profile — replacing the old generic Home/Book/History/Profile. Book
  // itself is no longer one tab: household IS the home tab (the dial's
  // 3rd, default sector), and labour/transport get their own dedicated
  // routes+tabs matching their own separate Stitch screens.

  useEffect(() => {
    if (!loading && (!user || user.role !== 'customer')) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user || user.role !== 'customer') {
    return <div className="min-h-screen flex items-center justify-center text-fy-muted">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-fy-bone pb-24">
      {children}
      <CustomerTabBar />
    </div>
  );
}
