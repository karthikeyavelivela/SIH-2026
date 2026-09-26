'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { TopBar } from '@/components/fy/Navigation';
import { Button } from '@/components/fy/Controls';
import { MyContracts } from '@/components/contracts/ContractViews';
import { ProposeContractForm } from '@/components/contracts/ProposeContractForm';

// P1.6 — an institution's contracts with societies.
export default function CustomerContractsPage() {
  const t = useTranslations('contracts');
  const router = useRouter();
  const [proposing, setProposing] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <div className="min-h-screen bg-fy-bone">
      <TopBar title={t('title')} showBack onBack={() => router.back()} />
      <main className="pt-16 fy-pad-nav px-gutter max-w-2xl mx-auto flex flex-col gap-3">
        {proposing ? (
          <ProposeContractForm
            onProposed={() => {
              setProposing(false);
              setVersion((v) => v + 1);
            }}
          />
        ) : (
          <Button glyph="add" onClick={() => setProposing(true)}>
            {t('proposeNew')}
          </Button>
        )}
        <MyContracts key={version} detailHref={(id) => `/customer/contracts/${id}`} />
      </main>
    </div>
  );
}
