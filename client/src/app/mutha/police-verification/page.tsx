'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/fy/Navigation';
import { PoliceReviewQueue } from '@/components/kyc/PoliceReviewQueue';

/** P4.4: police verifications waiting for a check. A society leader sees their own members'. */
export default function PoliceVerificationQueuePage() {
  const t = useTranslations('credentials');
  const router = useRouter();
  return (
    <div className="min-h-screen bg-fy-bone">
      <TopBar title={t('reviewLink')} showBack onBack={() => router.back()} />
      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto">
        <PoliceReviewQueue />
      </main>
    </div>
  );
}
