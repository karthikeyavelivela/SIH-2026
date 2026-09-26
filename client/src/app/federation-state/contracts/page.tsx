'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { TopBar } from '@/components/fy/Navigation';
import { ContractList } from '@/components/contracts/ContractViews';

// P1.6 — every contract held by the societies under this federation.
export default function StateContractsPage() {
  const t = useTranslations('contracts');
  const router = useRouter();
  const { data } = usePolling(() => api.get<{ contracts: Parameters<typeof ContractList>[0]['contracts'] }>('/api/contracts/federation'), 30000);
  return (
    <div className="min-h-screen bg-fy-bone">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 px-gutter max-w-2xl mx-auto flex flex-col gap-3 pb-10">
        {!data ? <div className="h-32 rounded-card bg-fy-panel animate-pulse" /> : <ContractList contracts={data.contracts} detailHref={(id) => `/federation-state/contracts/${id}`} />}
      </main>
    </div>
  );
}
