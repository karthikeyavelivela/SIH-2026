'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { QueueCounter } from '@/components/ui/QueueCounter';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ClockIcon, AlertIcon } from '@/components/ui/icons';

interface LatePickup {
  bookingId: string;
  pickupAddress: string;
  dropAddress: string;
  acceptedAt: string;
  customer: { name: string } | null;
}

interface ActionItem {
  kind: 'dispute' | 'fraud_case' | 'payout';
  id: string;
  title: string;
  priority: string;
  createdAt: string;
}

interface OpsHubData {
  latePickups: LatePickup[];
  counts: { latePickups: number; openDisputes: number; openFraudCases: number; pendingPayouts: number };
  actionQueue: ActionItem[];
}

const ACTION_LINK: Record<ActionItem['kind'], (id: string) => string> = {
  dispute: (id) => `/admin/disputes/${id}`,
  fraud_case: () => '/admin/fraud-alerts',
  payout: () => '/admin/payouts',
};

// New page — DESIGN_INVENTORY.md operations_manager_hub (manager screen,
// scoped to the admin/ route group per that doc). Aggregates real Booking
// late-pickup detection + the Dispute/FraudCase/Payout queues built
// alongside this page, via server/src/controllers/opsHub.controller.ts (new).
export default function AdminOpsHubPage() {
  const t = useTranslations('adminOpsHub');
  const { data, state } = usePolling(() => api.get<OpsHubData>('/api/admin/ops-hub'), 15000);
  const counts = data?.counts;
  const latePickups = data?.latePickups ?? [];
  const actionQueue = data?.actionQueue ?? [];

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">{t('subtitle')}</p>

      {state === 'loading' && !data ? (
        <Skeleton className="h-24 mb-8" />
      ) : (
        <div className="grid sm:grid-cols-4 gap-4 mb-10">
          <QueueCounter count={counts?.latePickups ?? 0} label={t('latePickups')} tone={counts?.latePickups ? 'danger' : 'muted'} />
          <QueueCounter count={counts?.openDisputes ?? 0} label={t('openDisputes')} tone={counts?.openDisputes ? 'primary' : 'muted'} />
          <QueueCounter count={counts?.openFraudCases ?? 0} label={t('fraudCases')} tone={counts?.openFraudCases ? 'danger' : 'muted'} />
          <QueueCounter count={counts?.pendingPayouts ?? 0} label={t('pendingPayouts')} tone={counts?.pendingPayouts ? 'primary' : 'muted'} />
        </div>
      )}

      <h2 className="font-heading text-ip-headline-sm font-bold mb-3">{t('criticalAlerts')}</h2>
      {latePickups.length === 0 ? (
        <div className="ip-card mb-10">
          <EmptyState icon={<ClockIcon className="w-7 h-7" />} title={t('noLatePickups')} description={t('noLatePickupsDesc')} />
        </div>
      ) : (
        <div className="space-y-3 mb-10 max-w-3xl">
          {latePickups.map((b) => (
            <AlertBanner key={b.bookingId} tone="warning" icon={<ClockIcon className="w-5 h-5" />}>
              <p className="font-semibold">{t('pickupOverdue', { name: b.customer?.name ?? t('unknownCustomer') })}</p>
              <p>{b.pickupAddress} → {b.dropAddress}</p>
              <p className="text-xs mt-0.5">{t('accepted', { date: new Date(b.acceptedAt).toLocaleString('en-IN') })}</p>
            </AlertBanner>
          ))}
        </div>
      )}

      <h2 className="font-heading text-ip-headline-sm font-bold mb-3">{t('actionRequired')}</h2>
      {actionQueue.length === 0 ? (
        <div className="ip-card">
          <EmptyState icon={<AlertIcon className="w-7 h-7" />} title={t('allClear')} description={t('allClearDesc')} />
        </div>
      ) : (
        <div className="ip-card max-w-3xl divide-y divide-ip-outline/10">
          {actionQueue.map((item) => (
            <Link
              key={`${item.kind}-${item.id}`}
              href={ACTION_LINK[item.kind](item.id)}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:opacity-80"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{item.title}</p>
                <p className="text-xs text-ip-on-surface-variant capitalize">{t(`kind.${item.kind}`)} · {item.priority} · {new Date(item.createdAt).toLocaleDateString('en-IN')}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
