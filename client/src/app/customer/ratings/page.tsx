'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { Icon } from '@/components/ui/Icon';
import { RatingModal } from '@/components/worker/RatingModal';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body, MutedText } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';
import { CustomerTabBar } from '@/components/fy/CustomerTabBar';

/* The pending-ratings screen.
 *
 * The server blocks a new booking until the last completed one is rated, and
 * names that booking in the error — but nothing in the app ever showed the
 * list, so "please rate your last booking" was a dead end on the one screen
 * where someone is trying to spend money. This is the place that error now
 * points at.
 *
 * Every row is a real completed booking this customer was party to and has
 * not yet rated. A row that has been deferred says so and stays listed —
 * "rate later" is a pause, not a dismissal. */

interface PendingBooking {
  _id: string;
  serviceType?: string;
  type?: string;
  pickupAddress?: string;
  dropAddress?: string;
  fareBreakdown?: { total?: number };
  completedAt?: string;
  updatedAt?: string;
  deferredUntil?: string | null;
}

interface PendingResponse {
  bookingId: string | null;
  pending: PendingBooking[];
}

export default function CustomerPendingRatingsPage() {
  const t = useTranslations('pendingRatings');
  const router = useRouter();
  const [rating, setRating] = useState<string | null>(null);

  const state = useApiState(() => api.get<PendingResponse>('/api/ratings/pending'), []);
  const pending = state.data?.pending ?? [];
  const blockingId = state.data?.bookingId ?? null;

  function whenDeferred(iso?: string | null) {
    if (!iso) return null;
    const at = new Date(iso).getTime();
    if (at <= Date.now()) return null;
    const hours = Math.max(1, Math.round((at - Date.now()) / 3600000));
    return t('deferredFor', { hours });
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar eyebrow="FYRO Cooperative" title={t('pageTitle')} showBack />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="flex flex-col gap-1 pt-2">
          <EyebrowLabel tone="brown">{t('eyebrow')}</EyebrowLabel>
          <SectionHeading>{t('heading')}</SectionHeading>
          <Body>{t('lede')}</Body>
        </div>

        {state.status === 'loading' && (
          <div className="flex flex-col gap-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-28 rounded-card bg-fy-field animate-pulse" />
            ))}
          </div>
        )}

        {state.status === 'error' && (
          <LightCard className="flex flex-col gap-3">
            <Body>{state.errorMessage ?? t('loadError')}</Body>
            <Button variant="light" className="w-full" onClick={() => state.reload()}>
              {t('tryAgain')}
            </Button>
          </LightCard>
        )}

        {state.status === 'success' && pending.length === 0 && (
          <LightCard className="flex flex-col items-center text-center gap-3 py-8">
            <IconTile tone="lime" size="lg">
              <Icon name="task_alt" size={22} />
            </IconTile>
            <Body className="font-semibold">{t('allClearTitle')}</Body>
            <MutedText>{t('allClearBody')}</MutedText>
            <Button className="w-full mt-1" onClick={() => router.push('/customer/dashboard')}>
              {t('backToBooking')}
            </Button>
          </LightCard>
        )}

        {pending.length > 0 && (
          <Section
            title={<SectionHeading>{t('jobsHeading')}</SectionHeading>}
            aside={<EyebrowLabel>{t('count', { count: pending.length })}</EyebrowLabel>}
          >
            <div className="flex flex-col gap-2">
              {pending.map((b) => {
                const deferred = whenDeferred(b.deferredUntil);
                const blocking = b._id === blockingId;
                return (
                  <Panel key={b._id} className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex items-center gap-3 min-w-0">
                        <IconTile tone={blocking ? 'peach' : 'slate-pale'} size="lg">
                          <Icon name="star" size={20} />
                        </IconTile>
                        <span className="flex flex-col min-w-0">
                          <Body className="font-semibold truncate">
                            {b.pickupAddress ?? t('aJob')}
                            {b.dropAddress ? ` → ${b.dropAddress}` : ''}
                          </Body>
                          <EyebrowLabel>
                            {b.completedAt || b.updatedAt
                              ? new Date(b.completedAt ?? b.updatedAt!).toLocaleDateString('en-IN')
                              : ''}
                          </EyebrowLabel>
                        </span>
                      </span>
                      {b.fareBreakdown?.total != null && (
                        <span className="font-heading text-title text-fy-ink font-semibold shrink-0 tabular-nums">
                          ₹{Math.round(b.fareBreakdown.total).toLocaleString('en-IN')}
                        </span>
                      )}
                    </div>

                    {(blocking || deferred) && (
                      <>
                        <Divider />
                        <div className="flex items-center gap-2 flex-wrap">
                          {blocking && <StatusPill tone="critical">{t('blockingPill')}</StatusPill>}
                          {deferred && <StatusPill tone="neutral">{deferred}</StatusPill>}
                        </div>
                      </>
                    )}

                    <Button className="w-full" glyph="star" onClick={() => setRating(b._id)}>
                      {t('rateThis')}
                    </Button>
                  </Panel>
                );
              })}
            </div>
          </Section>
        )}
      </main>

      {rating && (
        <RatingModal
          bookingId={rating}
          open
          allowDefer
          onDone={() => {
            setRating(null);
            state.reload();
          }}
        />
      )}

      <CustomerTabBar />
    </div>
  );
}
