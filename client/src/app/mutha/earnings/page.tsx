'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { EarningsResponse } from '@/lib/types';
import { EarningLineCard } from '@/components/worker/EarningLineCard';
import { IncentiveProgressBar } from '@/components/worker/IncentiveProgressBar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow, DataList, DataRow } from '@/components/fy/Data';
import { TopBar, TabRow } from '@/components/fy/Navigation';

/* Built against client/public/design/society_earnings.html.

   Section order there, top to bottom: 64px brand bar -> "Autonomous union
   ledger" eyebrow over "Society Earnings" -> Week / Month / All range tabs
   -> the DARK gross-value plate -> the net-crew and reserve-pool split ->
   the per-member breakdown -> the settled runs.

   Largest element: the gross value. Dark surfaces: the value plate. Green
   is the society accent.

   The split is real: the leader's earnings endpoint returns `retained` —
   the actual commission plus welfare kept across every member on every
   booking — alongside the society's own two rates, so the percentage shown
   is the society's real setting rather than the design's fixed 92/8.

   Not reproduced: the design's "Next automated payout: Friday direct-UPI
   at 18:00" countdown and its "+14.2% vs yesterday" trend. There is no
   payout schedule and no day-over-day series anywhere in the product. */

type Range = 'week' | 'month' | 'all';

function startOf(range: Range): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'week') {
    const dow = (d.getDay() + 6) % 7; // Monday-first
    d.setDate(d.getDate() - dow);
    return d.getTime();
  }
  if (range === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return 0;
}

export default function MuthaEarningsPage() {
  const t = useTranslations('muthaEarnings');
  const [range, setRange] = useState<Range>('week');
  const { data, state } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  const lines = useMemo(() => data?.lines ?? [], [data]);
  const inRange = useMemo(() => {
    const from = startOf(range);
    return lines.filter((l) => !l.completedAt || new Date(l.completedAt).getTime() >= from);
  }, [lines, range]);

  const gross = inRange.reduce((s, l) => s + l.amount, 0);
  // `retained` is measured across all bookings, so scale it to the visible
  // range rather than showing an all-time figure beside a weekly gross.
  const allTime = data?.total ?? 0;
  const retainedAll = data?.retained ?? 0;
  const retained = allTime > 0 ? Math.round((retainedAll * gross) / allTime) : 0;
  const net = Math.max(0, gross - retained);
  const reservePct = (data?.commissionRatePct ?? 0) + (data?.welfareDeductionRatePct ?? 0);
  const netPct = Math.max(0, 100 - reservePct);

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar eyebrow="FYRO Society" title={t('title')} showBack />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 pt-2">
          <EyebrowLabel tone="green">{t('ledgerEyebrow')}</EyebrowLabel>
          {!!data?.incentiveTotal && <StatusPill tone="lime">{t('bonusEarned', { amount: data.incentiveTotal })}</StatusPill>}
        </div>

        <TabRow
          variant="segment"
          active={range}
          onChange={(k) => setRange(k as Range)}
          tabs={[
            { key: 'week', label: t('rangeWeek') },
            { key: 'month', label: t('rangeMonth') },
            { key: 'all', label: t('rangeAll') },
          ]}
        />

        <div className="bg-fy-green text-fy-on-green rounded-sheet p-5 shadow-card flex flex-col gap-3">
          <MetricBlock
            onDark
            tone="lime"
            label={t('grossValue')}
            value={`₹${gross.toLocaleString('en-IN')}`}
            note={t('aggregatedAcross', { count: inRange.length })}
          />
          <Divider className="border-fy-bone/20" />
          <div className="flex flex-col gap-2">
            <StatRow
              className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-lime"
              label={t('netCrew', { pct: netPct })}
              value={`₹${net.toLocaleString('en-IN')}`}
            />
            <StatRow
              className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-bone"
              label={t('reservePool', { pct: reservePct })}
              value={`₹${retained.toLocaleString('en-IN')}`}
            />
          </div>
        </div>

        <LightCard className="flex items-start gap-3">
          <IconTile tone="lime" size="sm">
            <Icon name="handshake" size={18} />
          </IconTile>
          <div className="min-w-0">
            <p className="font-body text-label font-semibold text-fy-ink">{t('splitTitle')}</p>
            <Body size="label">{t('splitNote')}</Body>
          </div>
        </LightCard>

        <IncentiveProgressBar accent="secondary" />

        <Section
          title={<SectionHeading>{t('perMember')}</SectionHeading>}
          aside={<EyebrowLabel>{t('memberCount', { count: data?.perMember?.length ?? 0 })}</EyebrowLabel>}
        >
          {state === 'loading' && <div className="h-24 rounded-card bg-fy-field animate-pulse" />}

          {state !== 'loading' && (data?.perMember?.length ?? 0) === 0 && (
            <LightCard>
              <EmptyState title={t('noCompletedJobs')} description={t('noCompletedJobsHint')} />
            </LightCard>
          )}

          {(data?.perMember?.length ?? 0) > 0 && (
            <Panel className="py-0">
              <DataList>
                {data!.perMember!.map((m) => (
                  <DataRow
                    key={m.userId}
                    lead={
                      <IconTile tone="lime" size="md" className="rounded-full">
                        <Icon name="person" size={18} />
                      </IconTile>
                    }
                    title={m.name}
                    meta={m.phone}
                    trailing={<span className="font-heading text-title text-fy-ink">₹{m.total.toLocaleString('en-IN')}</span>}
                  />
                ))}
              </DataList>
            </Panel>
          )}
        </Section>

        <Section
          title={<SectionHeading>{t('orderHistory')}</SectionHeading>}
          aside={<EyebrowLabel>{t('settledCount', { count: inRange.length })}</EyebrowLabel>}
        >
          {inRange.length === 0 ? (
            <LightCard>
              <Body size="label">{t('noRunsInRange')}</Body>
            </LightCard>
          ) : (
            inRange.map((line) => <EarningLineCard key={line.bookingId} line={line} />)
          )}
        </Section>
      </main>
    </div>
  );
}
