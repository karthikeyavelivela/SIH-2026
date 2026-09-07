'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useIncomingOffer } from '@/lib/useIncomingOffer';
import { useAuth } from '@/lib/auth-context';
import { Booking } from '@/lib/types';
import { RequestCard } from '@/components/worker/RequestCard';
import { OfferCard } from '@/components/worker/OfferCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Section, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_requests_queue.html.

   Section order there, top to bottom: 64px brand bar with a verified
   MEMBER pill -> a telemetry/coop-id sliver -> "Dispatch Queue" heading
   with a live count of what is available -> the LIVE MANDATE card (the
   pushed exclusive offer, with its countdown) -> "Nearby Ledger Holds",
   auto-refreshing, as a list of claimable rows -> 5-tab bar.

   Largest element: the offer's payout. Dark surfaces: the offer plate.

   The design's "COOP ID #8841-HYD" is shown from the worker's real record
   id rather than an invented one, and the telemetry line reflects the
   actual poll rather than claiming a corridor lock that nothing tracks. */

export function RequestsQueue({ base, accent }: { base: '/driver' | '/hamali'; accent: 'primary' | 'secondary' }) {
  const t = useTranslations('workerRequests');
  const { user } = useAuth();
  const { data, state, reload, setData } = usePolling(() => api.get<{ requests: Booking[] }>('/api/requests'), 6000);
  const { offer, responding, respond } = useIncomingOffer();
  // respond() resolves (never rejects) with {ok,error} over the socket ack.
  // That result used to be discarded, so a failed accept — lost the race,
  // or the mandatory-rating gate — looked identical to a successful one.
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
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Cooperative"
        title={t('pageTitle')}
        actions={user?.accountStatus === 'active' ? <StatusPill tone="lime">{t('memberPill')}</StatusPill> : undefined}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-fy-green animate-pulse" />
            <EyebrowLabel tone="green">{t('telemetryActive')}</EyebrowLabel>
          </span>
          {user?._id && <EyebrowLabel>{t('coopId', { id: user._id.slice(-6).toUpperCase() })}</EyebrowLabel>}
        </div>

        <div>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('queueHeading')}</h2>
          <Body className="mt-1">{t('queueCount', { count: requests.length })}</Body>
        </div>

        {offer && (
          <div className="flex flex-col gap-2">
            <OfferCard
              offer={offer}
              accent={accent}
              responding={responding}
              onAccept={() => respondToOffer(true)}
              onReject={() => respondToOffer(false)}
            />
            {offerError && (
              <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
                {offerError}
              </div>
            )}
          </div>
        )}

        <Link href={`${base}/loadboard`} className="block">
          <LightCard className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <IconTile tone={accent === 'primary' ? 'peach' : 'lime'} size="md">
                <Icon name="gavel" size={20} />
              </IconTile>
              <div className="min-w-0">
                <p className="font-body text-label font-semibold text-fy-ink">{t('loadBoardLink')}</p>
                <Body size="label">{t('loadBoardHint')}</Body>
              </div>
            </div>
            <Icon name="chevron_right" size={18} className="text-fy-muted shrink-0" />
          </LightCard>
        </Link>

        <Section
          title={<SectionHeading>{t('nearbyHolds')}</SectionHeading>}
          aside={
            <span className="flex items-center gap-1">
              <Icon name="sync" size={13} className="text-fy-muted" />
              <EyebrowLabel>{t('autoRefreshing')}</EyebrowLabel>
            </span>
          }
        >
          {state === 'loading' && (
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-32 rounded-card bg-fy-panel animate-pulse" />
              ))}
            </div>
          )}

          {state !== 'loading' && requests.length === 0 && (
            <LightCard>
              <EmptyState title={t('noRequests')} description={t('noRequestsHint')} />
            </LightCard>
          )}

          {requests.map((b) => (
            <RequestCard key={b._id} booking={b} accent={accent} onAccept={accept} onReject={reject} />
          ))}
        </Section>
      </main>
    </div>
  );
}
