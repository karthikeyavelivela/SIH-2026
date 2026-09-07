'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useAuth } from '@/lib/auth-context';
import { EarningsResponse, EarningLine } from '@/lib/types';
import { DEFAULT_PLATFORM_COMMISSION_PCT } from '@/lib/platformCommission';
import { EarningLineCard } from '@/components/worker/EarningLineCard';
import { IncentiveProgressBar } from '@/components/worker/IncentiveProgressBar';
import { CodCollectionSection } from '@/components/worker/CodCollectionSection';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow } from '@/components/fy/Data';
import { TopBar, TabRow } from '@/components/fy/Navigation';

/* Built against client/public/design/worker_earnings.html.

   Section order there, top to bottom: 64px brand bar with the MEMBER pill
   -> "Cooperative Ledger" eyebrow -> Week / Month / All range tabs -> the
   DARK plate carrying the total for that range -> a seven-day breakdown
   with per-day amount and trip count -> the day's trips -> 5-tab bar.

   Largest element: the range total. Dark surfaces: the total plate.

   The design also prints "Auto-settled directly to State Bank of India
   ··4802". No bank account is stored anywhere in the product, so that line
   is not reproduced — the plate says where the money comes from (completed
   jobs in the range) rather than naming an account that does not exist. */

type Range = 'week' | 'month' | 'all';

function startOf(range: Range): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (range === 'week') {
    // Monday-first, matching the design's Mon…Sun strip.
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d.getTime();
  }
  if (range === 'month') {
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  return 0;
}

export function WorkerEarnings({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('workerEarnings');
  const { user } = useAuth();
  const [range, setRange] = useState<Range>('week');
  const { data, state } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  const lines = useMemo(() => data?.lines ?? [], [data]);

  const inRange = useMemo(() => {
    const from = startOf(range);
    return lines.filter((l) => !l.completedAt || new Date(l.completedAt).getTime() >= from);
  }, [lines, range]);

  const rangeTotal = inRange.reduce((s, l) => s + l.amount, 0);
  // Summed from the per-line disclosures the server sends, so the split on
  // screen always adds up to the net beside it.
  const rangeGross = inRange.reduce((s, l) => s + (l.grossAmount ?? l.amount), 0);
  const rangePlatformFee = inRange.reduce((s, l) => s + (l.platformFee ?? 0), 0);
  const rangeSocietyFee = inRange.reduce((s, l) => s + (l.societyFee ?? 0), 0);

  /** Monday-first buckets for the current week, from the real completedAt stamps. */
  const week = useMemo(() => {
    const start = startOf('week');
    const days: { label: string; total: number; count: number; isToday: boolean; isFuture: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(start + i * 86400000);
      const next = day.getTime() + 86400000;
      const dayLines = lines.filter((l) => {
        if (!l.completedAt) return false;
        const ts = new Date(l.completedAt).getTime();
        return ts >= day.getTime() && ts < next;
      });
      days.push({
        label: day.toLocaleDateString(undefined, { weekday: 'short' }),
        total: dayLines.reduce((s, l) => s + l.amount, 0),
        count: dayLines.length,
        isToday: day.getTime() === today.getTime(),
        isFuture: day.getTime() > today.getTime(),
      });
    }
    return days;
  }, [lines]);

  const weekPeak = Math.max(1, ...week.map((d) => d.total));
  const dark = accent === 'primary' ? 'bg-fy-brown' : 'bg-fy-green';

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
          <EyebrowLabel tone={accent === 'primary' ? 'brown' : 'green'}>{t('ledgerEyebrow')}</EyebrowLabel>
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

        <div className={`${dark} text-fy-bone rounded-sheet p-5 shadow-card flex flex-col gap-3`}>
          <MetricBlock
            onDark
            tone="lime"
            label={t(`totalFor.${range}`)}
            value={`₹${rangeTotal.toLocaleString('en-IN')}`}
            note={t('completedJobs', { count: inRange.length })}
          />

          {/* Every deduction, itemised. A worker should never have to work
              out why the number is smaller than the fare they saw. */}
          {rangeGross > 0 && (
            <>
              <Divider className="border-fy-bone/15" />
              <div className="flex flex-col gap-2">
                <StatRow
                  className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-bone"
                  label={t('grossLabel')}
                  value={`₹${rangeGross.toLocaleString('en-IN')}`}
                />
                {rangePlatformFee > 0 && (
                  <StatRow
                    className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-bone"
                    label={t('platformFee', { pct: data?.platformRatePct ?? DEFAULT_PLATFORM_COMMISSION_PCT })}
                    value={`−₹${rangePlatformFee.toLocaleString('en-IN')}`}
                  />
                )}
                {rangeSocietyFee > 0 && (
                  <StatRow
                    className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-bone"
                    label={t('societyFee')}
                    value={`−₹${rangeSocietyFee.toLocaleString('en-IN')}`}
                  />
                )}
                <StatRow
                  className="[&>span:first-child]:text-fy-bone/70 [&>span:last-child]:text-fy-lime"
                  label={t('netLabel')}
                  value={`₹${rangeTotal.toLocaleString('en-IN')}`}
                />
              </div>
            </>
          )}

          <Divider className="border-fy-bone/15" />
          <span className="flex items-center gap-1.5">
            <Icon name="sync_alt" size={14} className="text-fy-lime" />
            <EyebrowLabel tone="on-dark" className="opacity-80">
              {t('deductionNote')}
            </EyebrowLabel>
          </span>
        </div>

        {/* Seven-day breakdown, bucketed from the real completedAt stamps. */}
        <Section title={<SectionHeading>{t('dailyBreakdown')}</SectionHeading>}>
          <LightCard>
            <div className="flex items-end justify-between gap-1.5 h-28">
              {week.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 min-w-0">
                  <span className="font-body text-eyebrow text-fy-ink-soft whitespace-nowrap">
                    {d.total > 0 ? `₹${Math.round(d.total / 100) / 10}k` : '—'}
                  </span>
                  <div
                    className={`w-full rounded-t-cell ${
                      d.total > 0 ? (accent === 'primary' ? 'bg-fy-brown' : 'bg-fy-green') : 'bg-fy-dim'
                    } ${d.isToday ? 'ring-2 ring-fy-lime' : ''}`}
                    style={{ height: `${Math.max(4, (d.total / weekPeak) * 72)}px` }}
                    aria-hidden
                  />
                  <span className={`font-body text-eyebrow uppercase ${d.isToday ? 'text-fy-ink font-semibold' : 'text-fy-muted'}`}>
                    {d.label}
                  </span>
                </div>
              ))}
            </div>
            <Divider className="my-3" />
            <div className="flex items-center justify-between gap-3">
              <Body size="label">{t('weekTrips', { count: week.reduce((s, d) => s + d.count, 0) })}</Body>
              <EyebrowLabel>{t('weekTotal', { amount: week.reduce((s, d) => s + d.total, 0) })}</EyebrowLabel>
            </div>
          </LightCard>
        </Section>

        <IncentiveProgressBar accent={accent} />
        <CodCollectionSection accent={accent} />

        <Section
          title={<SectionHeading>{t('orderHistory')}</SectionHeading>}
          aside={<EyebrowLabel>{t('settledCount', { count: inRange.length })}</EyebrowLabel>}
        >
          {state === 'loading' && <div className="h-24 rounded-card bg-fy-field animate-pulse" />}

          {state !== 'loading' && inRange.length === 0 && (
            <LightCard>
              <EmptyState title={t('noCompletedJobs')} description={t('noCompletedJobsHint')} />
            </LightCard>
          )}

          {inRange.map((line: EarningLine) => (
            <EarningLineCard key={line.bookingId} line={line} />
          ))}
        </Section>
      </main>
    </div>
  );
}
