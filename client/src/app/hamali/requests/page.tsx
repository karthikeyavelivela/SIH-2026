'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useIncomingOffer } from '@/lib/useIncomingOffer';
import { Booking } from '@/lib/types';
import Link from 'next/link';
import { RequestCard } from '@/components/worker/RequestCard';
import { OfferCard } from '@/components/worker/OfferCard';
import { TopBar } from '@/components/ui/TopBar';
import { LayersIcon, AlertIcon, SparkleIcon } from '@/components/ui/icons';

export default function HamaliRequestsPage() {
  const t = useTranslations('workerRequests');
  const { data, state, reload, setData } = usePolling(
    () => api.get<{ requests: Booking[] }>('/api/requests'),
    6000
  );
  const { offer, responding, respond } = useIncomingOffer();
  const [offerError, setOfferError] = useState<string | null>(null);

  async function respondToOffer(accept: boolean) {
    setOfferError(null);
    const ack = await respond(accept);
    if (!ack.ok && ack.error) setOfferError(ack.error);
    await reload();
  }

  async function accept(bookingId: string) {
    await api.post(`/api/requests/${bookingId}/accept`);
    await reload();
  }

  async function reject(bookingId: string) {
    await api.post(`/api/requests/${bookingId}/reject`);
    setData((prev) => (prev ? { requests: prev.requests.filter((b) => b._id !== bookingId) } : prev));
  }

  const requests = data?.requests ?? [];

  return (
    <div className="min-h-screen bg-fy-bone pb-24">
      <TopBar title={t('pageTitle')} showBack={false} />
      <div className="max-w-lg mx-auto px-gutter pt-4">
      <p className="text-sm text-fy-ink-soft mb-4">{t('subtitleHamali')}</p>

      <Link
        href="/hamali/loadboard"
        className="flex items-center gap-2.5 mb-6 p-3 rounded-card bg-fy-green/10 text-secondary-700 hover:bg-fy-green/15 transition-colors duration-fast text-sm font-semibold"
      >
        <SparkleIcon className="w-4 h-4 flex-shrink-0" />
        {t('loadBoardLink')}
      </Link>

      {offer && (
        <div className="mb-6">
          <OfferCard
            offer={offer}
            accent="secondary"
            responding={responding}
            onAccept={() => respondToOffer(true)}
            onReject={() => respondToOffer(false)}
          />
          {offerError && (
            <div role="alert" className="flex items-start gap-2 mt-2 rounded-control border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
              <AlertIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <p>{offerError}</p>
            </div>
          )}
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 rounded-card bg-fy-panel animate-pulse" />
          ))}
        </div>
      )}

      {state !== 'loading' && requests.length === 0 && (
        <div className="text-center py-16">
          <LayersIcon className="w-10 h-10 text-fy-muted/50 mx-auto mb-3" />
          <p className="text-sm text-fy-muted">{t('noRequests')}</p>
        </div>
      )}

      <div className="space-y-4">
        {requests.map((b) => (
          <RequestCard
            key={b._id}
            booking={b}
            accent="secondary"
            onAccept={accept}
            onReject={reject}
            hamaliSlotsNote={
              b.requiredHamaliCount > 1
                ? t('workersConfirmed', { confirmed: b.assignedHamaliIds.length, required: b.requiredHamaliCount })
                : undefined
            }
          />
        ))}
      </div>
      </div>
    </div>
  );
}
