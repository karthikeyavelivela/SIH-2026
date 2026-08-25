'use client';

import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { EarningsResponse } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { TopBar } from '@/components/ui/TopBar';
import { EarningLineCard } from '@/components/worker/EarningLineCard';
import { IncentiveProgressBar } from '@/components/worker/IncentiveProgressBar';
import { CodCollectionSection } from '@/components/worker/CodCollectionSection';
import { WalletIcon, StarIcon } from '@/components/ui/icons';

// Also covers the "wallet_payouts" Stitch screen per DESIGN_INVENTORY.md's
// merge note — see driver/earnings for why "wallet balance" here is
// honestly the same total-earned figure rather than a fabricated
// withdraw-to-bank flow with no real backend behind it.
export default function HamaliEarningsPage() {
  const t = useTranslations('workerEarnings');
  const { data, state } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  return (
    <div className="min-h-screen bg-ip-surface pb-24">
      <TopBar title={t('pageTitle')} showBack={false} />
      <div className="max-w-lg mx-auto px-ip-edge pt-ip-sm">

      <div className="rounded-ip-card bg-secondary-600 text-white p-6 mb-ip-sm">
        <p className="text-sm text-white/80 mb-1">{t('walletBalance')}</p>
        <p className="font-heading text-3xl font-extrabold">₹{data?.total ?? 0}</p>
        <p className="text-sm text-white/80 mt-1">{t('completedJobs', { count: data?.jobCount ?? 0 })}</p>
      </div>

      {!!data?.incentiveTotal && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-ip-card bg-secondary/10 text-sm text-secondary-600">
          <StarIcon className="w-4 h-4 flex-shrink-0" />
          {t('bonusEarned', { amount: data.incentiveTotal })}
        </div>
      )}

      <IncentiveProgressBar accent="secondary" />

      <CodCollectionSection accent="secondary" />

      <h2 className="font-heading text-lg font-bold mb-3">{t('orderHistory')}</h2>

      {state === 'loading' && <div className="h-24 rounded-ip-card bg-ip-surface-container animate-pulse" />}

      {state !== 'loading' && (data?.lines.length ?? 0) === 0 && (
        <Card elevation="raised" className="text-center py-10">
          <WalletIcon className="w-8 h-8 text-ip-on-surface-variant/50 mx-auto mb-3" />
          <p className="text-sm text-ip-on-surface-variant">{t('noCompletedJobs')}</p>
        </Card>
      )}

      <div className="space-y-3">
        {data?.lines.map((line) => (
          <EarningLineCard key={line.bookingId} line={line} />
        ))}
      </div>
      </div>
    </div>
  );
}
