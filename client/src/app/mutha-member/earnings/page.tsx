'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { EarningsResponse } from '@/lib/types';
import { EarningLineCard } from '@/components/worker/EarningLineCard';
import { IncentiveProgressBar } from '@/components/worker/IncentiveProgressBar';
import { CodCollectionSection } from '@/components/worker/CodCollectionSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { WalletIcon, StarIcon, ShieldIcon, ChevronRightIcon } from '@/components/ui/icons';

export default function MuthaMemberEarningsPage() {
  const t = useTranslations('workerEarnings');
  const tw = useTranslations('workerDashboard');
  const { data, state } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">{t('pageTitle')}</h1>

      <div className="rounded-lg bg-secondary-600 text-white p-6 shadow-lg mb-6">
        <p className="text-sm text-white/80 mb-1">{t('totalEarned')}</p>
        <p className="font-heading text-3xl font-extrabold">₹{data?.total ?? 0}</p>
        <p className="text-sm text-white/80 mt-1">{t('completedJobs', { count: data?.jobCount ?? 0 })}</p>
      </div>

      {!!data?.incentiveTotal && (
        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-md bg-secondary/10 text-sm text-secondary-600">
          <StarIcon className="w-4 h-4 flex-shrink-0" />
          {t('bonusEarned', { amount: data.incentiveTotal })}
        </div>
      )}

      <IncentiveProgressBar accent="secondary" />

      <CodCollectionSection accent="secondary" />

      {/* Phase 3.1 — /mutha-member/insurance existed as a route with no
          nav entry anywhere (not even in the bottom tab bar), reachable
          only by typing the URL directly. */}
      <Link
        href="/mutha-member/insurance"
        className="flex items-center justify-between p-4 rounded-lg bg-surface-raised border border-border shadow-sm hover:shadow-md transition-all duration-base mb-6"
      >
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center">
            <ShieldIcon className="w-5 h-5" />
          </span>
          <p className="text-sm font-semibold">{tw('insuranceProtection')}</p>
        </div>
        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
      </Link>

      <h2 className="font-heading text-lg font-bold mb-3">{t('orderHistory')}</h2>
      {state === 'loading' && <div className="h-24 rounded-lg bg-surface animate-pulse" />}

      {state !== 'loading' && (data?.lines.length ?? 0) === 0 && (
        <div className="ip-card">
          <EmptyState icon={<WalletIcon className="w-6 h-6" />} title={t('noCompletedJobs')} />
        </div>
      )}

      <div className="space-y-3">
        {data?.lines.map((line) => (
          <EarningLineCard key={line.bookingId} line={line} />
        ))}
      </div>
    </div>
  );
}
