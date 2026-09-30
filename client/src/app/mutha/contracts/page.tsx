'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/fy/Navigation';
import { MyContracts } from '@/components/contracts/ContractViews';

// P1.6 — contracts institutions have proposed to, or hold with, this society.
export default function MuthaContractsPage() {
  const t = useTranslations('contracts');
  const router = useRouter();
  return (
    <div className="min-h-screen bg-fy-bone">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto flex flex-col gap-3">
        <MyContracts detailHref={(id) => `/mutha/contracts/${id}`} />
      </main>
    </div>
  );
}
