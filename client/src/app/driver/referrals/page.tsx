'use client';

import { useTranslations } from 'next-intl';
import { ReferralDashboard } from '@/components/worker/ReferralDashboard';

export default function DriverReferralsPage() {
  const t = useTranslations('referrals');
  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-xl font-bold mb-1">{t('pageTitle')}</h1>
      <p className="text-sm text-text-muted mb-6">{t('pageSubtitle')}</p>
      <ReferralDashboard accent="primary" />
    </div>
  );
}
