'use client';

import { useTranslations } from 'next-intl';
import { ReferralDashboard } from '@/components/worker/ReferralDashboard';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { TopBar } from '@/components/fy/Navigation';
import { WorkerTabBar } from '@/components/fy/RoleNav';

export default function DriverReferralsPage() {
  const t = useTranslations('referrals');
  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />
      <TopBar eyebrow="FYRO Cooperative" title={t('pageTitle')} showBack />
      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-1 pt-2">
          <EyebrowLabel tone="brown">{t('pageTitle')}</EyebrowLabel>
          <SectionHeading>{t('pageTitle')}</SectionHeading>
          <Body>{t('pageSubtitle')}</Body>
        </div>
        <ReferralDashboard accent="primary" />
      </main>
      <WorkerTabBar base="/driver" />
    </div>
  );
}
