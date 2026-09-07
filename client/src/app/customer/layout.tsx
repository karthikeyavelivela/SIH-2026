'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { BottomTabNav, TabItem } from '@/components/ui/BottomTabNav';
import { Icon } from '@/components/ui/Icon';

// Glyph-name -> icon-component adapter, since BottomTabNav's TabItem still
// takes a component (existing driver/hamali/mutha layouts all pass their
// own icon components too) — this just routes through Material Symbols
// instead of a hand-drawn SVG, matching every real Stitch screen's own nav.
function glyphIcon(name: string) {
  return function GlyphIcon({ className }: { className?: string }) {
    return <Icon name={name} className={className} size={22} />;
  };
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const t = useTranslations('nav');

  // Real Stitch screens (fyro_household_home, fyro_hamali_labour_standard,
  // fyro_goods_transport, fyro_booking_history_1, fyro_customer_profile_1)
  // all share this exact 5-tab nav — Household/Hamali/Transit/Passbook/
  // Profile — replacing the old generic Home/Book/History/Profile. Book
  // itself is no longer one tab: household IS the home tab (the dial's
  // 3rd, default sector), and labour/transport get their own dedicated
  // routes+tabs matching their own separate Stitch screens.
  const tabs: TabItem[] = [
    { href: '/customer/dashboard', label: t('household'), icon: glyphIcon('roofing') },
    { href: '/customer/book/labour', label: t('hamali'), icon: glyphIcon('engineering') },
    { href: '/customer/book/transport', label: t('transit'), icon: glyphIcon('local_shipping') },
    { href: '/customer/history', label: t('passbook'), icon: glyphIcon('receipt_long') },
    { href: '/customer/profile', label: t('profile'), icon: glyphIcon('account_circle') },
  ];

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
      <BottomTabNav items={tabs} />
    </div>
  );
}
