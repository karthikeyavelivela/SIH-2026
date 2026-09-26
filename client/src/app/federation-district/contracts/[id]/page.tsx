'use client';

import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/fy/Navigation';
import { ContractDetail } from '@/components/contracts/ContractViews';

// P1.6 — one contract, as the district federation sees it.
export default function DistrictContractDetailPage() {
  const t = useTranslations('contracts');
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  return (
    <div className="min-h-screen bg-fy-bone">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto">
        <ContractDetail id={id} viewer="federation" />
      </main>
    </div>
  );
}
