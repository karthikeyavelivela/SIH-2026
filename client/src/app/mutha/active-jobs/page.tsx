'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking, EarningsResponse } from '@/lib/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, ProgressBar } from '@/components/fy/Data';
import { Button } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/society_active_jobs.html.

   Section order there, top to bottom: 64px brand bar -> "Cooperative
   ledger" eyebrow with a passbook-verified pill -> the DARK live-yield
   plate for today, with how many members are active across how many
   manifests -> "Live crew operations" as one card per run, each carrying
   its stage, route, assigned-crew progress and the stage action.

   Largest element: today's yield. Dark surfaces: the yield plate. Green is
   the society accent.

   Today's yield is summed from the society's own completed earning lines
   with today's timestamps — real money, not a projection. The design's
   "+14.2% vs yesterday" and "100% DISPATCH" have no series or metric
   behind them and are not shown; the crew line beside the figure is the
   real count of members assigned across the live runs. */

const STEP_STATUSES = ['accepted', 'in_progress', 'completed'] as const;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function JobRow({ booking, onChanged }: { booking: Booking; onChanged: () => Promise<void> }) {
  const t = useTranslations('muthaActiveJobs');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEP_STATUSES.indexOf(booking.status as (typeof STEP_STATUSES)[number]);
  const crewPct = booking.requiredHamaliCount
    ? Math.round((booking.assignedHamaliIds.length / booking.requiredHamaliCount) * 100)
    : 0;
  const weightKg = booking.cargoDetails?.weightKg ?? 0;

  async function advance() {
    setPending(true);
    setError(null);
    try {
      const action = booking.status === 'accepted' ? 'start' : 'complete';
      await api.post(`/api/requests/${booking._id}/${action}`);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <EyebrowLabel>{t('runId', { id: booking._id.slice(-6).toUpperCase() })}</EyebrowLabel>
          <p className="font-body text-body font-semibold text-fy-ink truncate">
            {booking.pickupLocation.address.split(',')[0]} → {booking.dropLocation.address.split(',')[0]}
          </p>
          <Body size="label">
            {t('stageOf', { step: Math.max(1, stepIndex + 1), total: STEP_STATUSES.length })}
            {weightKg > 0 ? ` · ${(weightKg / 1000).toFixed(weightKg < 1000 ? 2 : 1)} T` : ''}
          </Body>
        </div>
        <div className="text-right shrink-0">
          <StatusPill tone={booking.status === 'in_progress' ? 'lime' : 'neutral'}>
            {booking.status === 'in_progress' ? t('working') : t('accepted')}
          </StatusPill>
          <p className="font-heading text-title text-fy-ink mt-1">₹{booking.fareBreakdown.total}</p>
        </div>
      </div>

      <Divider />

      <div>
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <EyebrowLabel>
            {t('membersAssigned', {
              assigned: booking.assignedHamaliIds.length,
              required: booking.requiredHamaliCount,
            })}
          </EyebrowLabel>
          <Link
            href={`/mutha/assign-members?bookingId=${booking._id}`}
            className="font-body text-label font-semibold text-fy-green hover:underline"
          >
            {t('manageCrew')}
          </Link>
        </div>
        <ProgressBar value={crewPct} tone="green" />
      </div>

      {error && (
        <div role="alert" className="rounded-control bg-fy-error-bg px-3.5 py-2.5 font-body text-label text-fy-on-error-bg">
          {error}
        </div>
      )}

      {booking.status !== 'completed' && (
        <Button variant="green" size="md" disabled={pending} onClick={advance} className="w-full">
          {pending ? t('updating') : booking.status === 'accepted' ? t('startJob') : t('markComplete')}
        </Button>
      )}
    </Panel>
  );
}

export default function MuthaActiveJobsPage() {
  const t = useTranslations('muthaActiveJobs');
  const { data, state, reload } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 8000);
  const { data: earnings } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);

  const jobs = useMemo(
    () => (data?.bookings ?? []).filter((b) => b.status === 'accepted' || b.status === 'in_progress'),
    [data]
  );

  // Real money settled today, from the society's own earning lines.
  const todayYield = useMemo(() => {
    const from = startOfToday();
    return (earnings?.lines ?? [])
      .filter((l) => l.completedAt && new Date(l.completedAt).getTime() >= from)
      .reduce((s, l) => s + l.amount, 0);
  }, [earnings]);

  const membersOnJobs = jobs.reduce((s, b) => s + b.assignedHamaliIds.length, 0);

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar eyebrow="FYRO Society" title={t('pageTitle')} />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 pt-2">
          <EyebrowLabel tone="green">{t('ledgerEyebrow')}</EyebrowLabel>
          <StatusPill tone="lime">{t('passbookVerified')}</StatusPill>
        </div>

        <div className="bg-fy-green text-fy-on-green rounded-sheet p-5 shadow-card flex flex-col gap-3">
          <MetricBlock
            onDark
            tone="lime"
            label={t('todayYield')}
            value={`₹${todayYield.toLocaleString('en-IN')}`}
            note={t('settledToday')}
          />
          <Divider className="border-fy-bone/20" />
          <span className="flex items-center gap-2">
            <Icon name="groups" size={18} className="text-fy-lime" />
            <EyebrowLabel tone="on-dark" className="opacity-85">
              {t('membersAcrossRuns', { members: membersOnJobs, runs: jobs.length })}
            </EyebrowLabel>
          </span>
        </div>

        <Section
          title={<SectionHeading>{t('liveOperations')}</SectionHeading>}
          aside={<EyebrowLabel tone="green">{t('runsLive', { count: jobs.length })}</EyebrowLabel>}
        >
          <Body size="label">{t('pageSubtitle')}</Body>

          {state === 'loading' && <div className="h-40 rounded-card bg-fy-field animate-pulse" />}

          {state !== 'loading' && jobs.length === 0 && (
            <LightCard>
              <EmptyState title={t('noActiveJobs')} description={t('noActiveJobsDesc')} />
            </LightCard>
          )}

          {jobs.map((b) => (
            <JobRow
              key={b._id}
              booking={b}
              onChanged={async () => {
                await reload();
              }}
            />
          ))}
        </Section>
      </main>
    </div>
  );
}
