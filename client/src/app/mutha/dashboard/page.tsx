'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Booking, EarningsResponse, MuthaResponse } from '@/lib/types';
import { RatingModal } from '@/components/worker/RatingModal';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { SupportAgentWidget, DemandForecastWidget } from '@/components/worker/AgentWidgets';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StatRow, DataList, DataRow } from '@/components/fy/Data';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/society_dashboard.html.

   Section order there, top to bottom: 64px brand bar (eyebrow + serif
   "Dashboard") -> society identity block with the affiliation line ->
   enrollment-credential card with a copy action -> DARK settlement plate
   carrying the pool total and the reserve / distributable / ratio trio ->
   member roster with per-member state -> active society runs -> master
   dispatch switch -> 5-tab bar.

   Largest element: the settlement total. Dark surfaces: the settlement
   plate. Green is the society accent throughout.

   The reserve/distributable split is real: the leader's earnings endpoint
   has always returned `retained` — the actual commission plus welfare kept
   across every member on every booking — alongside the society's own two
   rates. Only the client type was missing them. */

function statusTone(s: string): 'lime' | 'neutral' | 'outline' {
  if (s === 'online') return 'lime';
  if (s === 'on_job') return 'neutral';
  return 'outline';
}

export default function MuthaDashboardPage() {
  const t = useTranslations('muthaDashboard');
  const { user } = useAuth();
  const { data, state } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);
  const { data: bookingsData } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 15000);
  const { data: earningsData } = usePolling(() => api.get<EarningsResponse>('/api/earnings/me'), 30000);
  const [pendingRatingId, setPendingRatingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => {});
  }, []);

  const members = data?.members ?? [];
  const onlineCount = members.filter((m) => m.availabilityStatus === 'online').length;
  const activeJobs = (bookingsData?.bookings ?? []).filter(
    (b) => b.status === 'accepted' || b.status === 'in_progress'
  );

  const pool = earningsData?.total ?? 0;
  const retained = earningsData?.retained ?? 0;
  const distributable = Math.max(0, pool - retained);
  const reservePct =
    (earningsData?.commissionRatePct ?? data?.mutha.commissionRatePct ?? 0) +
    (earningsData?.welfareDeductionRatePct ?? data?.mutha.welfareDeductionRatePct ?? 0);

  async function copyCode() {
    if (!data?.mutha.inviteCode) return;
    try {
      await navigator.clipboard.writeText(data.mutha.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the code is on screen and selectable.
    }
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar eyebrow="FYRO Society" title={t('title')} actions={<NotificationBell href="/mutha/notifications" />} />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <NotificationPrompt accent="secondary" copy={t('notifyPrompt')} />

        {state === 'loading' && <div className="h-40 rounded-card bg-fy-field animate-pulse" />}

        {data && (
          <>
            <div className="pt-2">
              <EyebrowLabel tone="green">{data.mutha.region ?? t('society')}</EyebrowLabel>
              <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{data.mutha.name}</h2>
              <Body size="label" className="mt-1">
                {data.mutha.ratingCount
                  ? t('ratingLine', { rating: data.mutha.ratingAvg.toFixed(2), count: data.mutha.ratingCount })
                  : t('ratingNone')}
              </Body>
            </div>

            {/* Enrollment credential — the society's real invite code, which
                is how a local worker self-enrols. */}
            <LightCard className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <EyebrowLabel>{t('enrollmentCredential')}</EyebrowLabel>
                <p className="font-heading text-title text-fy-ink tracking-wide">{data.mutha.inviteCode}</p>
                <Body size="label" className="mt-0.5">
                  {t('enrollmentHint')}
                </Body>
              </div>
              <button
                type="button"
                onClick={copyCode}
                className="shrink-0 inline-flex items-center gap-1.5 font-body text-label font-semibold text-fy-green hover:underline"
              >
                <Icon name={copied ? 'check' : 'content_copy'} size={16} />
                {copied ? t('copied') : t('copy')}
              </button>
            </LightCard>

            {/* Settlement plate — the screen's largest element. */}
            <div className="bg-fy-green text-fy-on-green rounded-sheet p-5 shadow-card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <EyebrowLabel tone="on-dark" className="opacity-80">
                  {t('aggregateSettlement')}
                </EyebrowLabel>
                <StatusPill tone="lime" className="shrink-0">
                  {t('livePool')}
                </StatusPill>
              </div>
              <MetricBlock
                onDark
                tone="lime"
                label={t('societyPool')}
                value={`₹${pool.toLocaleString('en-IN')}`}
                note={t('completedRuns', { count: earningsData?.jobCount ?? 0 })}
              />
              <Divider className="border-fy-bone/20" />
              <div className="flex flex-col gap-2">
                <StatRow
                  className="[&>span:last-child]:text-fy-bone"
                  label={t('societyReserve', { pct: reservePct })}
                  value={`₹${retained.toLocaleString('en-IN')}`}
                />
                <StatRow
                  className="[&>span:last-child]:text-fy-lime"
                  label={t('distributable')}
                  value={`₹${distributable.toLocaleString('en-IN')}`}
                />
                {/* The design's "DISPATCH RATIO 94.2%" has no metric behind
                    it anywhere in the product; crew readiness is real, and
                    is what a leader actually needs to see here. */}
                <StatRow
                  className="[&>span:last-child]:text-fy-bone"
                  label={t('crewReady')}
                  value={t('crewReadyValue', { online: onlineCount, total: members.length })}
                />
              </div>
            </div>

            <Section
              title={<SectionHeading>{t('memberRoster')}</SectionHeading>}
              aside={
                <Link href="/mutha/members" className="font-body text-label font-semibold text-fy-green hover:underline">
                  {t('manage')}
                </Link>
              }
            >
              {members.length === 0 ? (
                <LightCard>
                  <Body size="label">{t('noMembers')}</Body>
                </LightCard>
              ) : (
                <Panel className="py-0">
                  <DataList>
                    {members.slice(0, 8).map((m) => (
                      <DataRow
                        key={m._id}
                        lead={
                          <IconTile tone="lime" size="md" className="rounded-full">
                            <Icon name="person" size={18} />
                          </IconTile>
                        }
                        title={m.name}
                        trailing={
                          <StatusPill tone={statusTone(m.availabilityStatus)}>
                            {t(`crewStatus.${m.availabilityStatus}`)}
                          </StatusPill>
                        }
                      />
                    ))}
                  </DataList>
                </Panel>
              )}
            </Section>

            <Section
              title={<SectionHeading>{t('activeRuns')}</SectionHeading>}
              aside={<EyebrowLabel tone="green">{t('inTransit', { count: activeJobs.length })}</EyebrowLabel>}
            >
              {activeJobs.length === 0 ? (
                <LightCard>
                  <Body size="label">{t('noActiveRuns')}</Body>
                </LightCard>
              ) : (
                activeJobs.map((b) => (
                  <Link key={b._id} href="/mutha/active-jobs" className="block">
                    <Panel className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <EyebrowLabel>{t('runId', { id: b._id.slice(-6).toUpperCase() })}</EyebrowLabel>
                          <p className="font-body text-body font-semibold text-fy-ink truncate">
                            {b.pickupLocation.address.split(',')[0]} → {b.dropLocation.address.split(',')[0]}
                          </p>
                        </div>
                        <StatusPill tone="neutral" className="shrink-0">
                          {t(`status.${b.status}` as never) ?? b.status}
                        </StatusPill>
                      </div>
                      <Divider />
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <EyebrowLabel>{t('runFare')}</EyebrowLabel>
                          <p className="font-heading text-title text-fy-green">₹{b.fareBreakdown.total}</p>
                        </div>
                        <span className="inline-flex items-center gap-1 font-body text-label font-semibold text-fy-green">
                          {t('manifest')}
                          <Icon name="arrow_forward" size={16} />
                        </span>
                      </div>
                    </Panel>
                  </Link>
                ))
              )}
            </Section>

            {/* The society bar carries five tabs per the design, which leaves
                Requests, Earnings, Insurance and Operations without a
                permanent tab — so they get a real entry point here rather
                than quietly becoming unreachable. */}
            <DataList>
              <DataRow
                lead={
                  <IconTile tone="lime" size="md" className="rounded-full">
                    <Icon name="fact_check" size={18} />
                  </IconTile>
                }
                title={t('openRequests')}
                trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
                onClick={() => (window.location.href = '/mutha/requests')}
              />
              <DataRow
                lead={
                  <IconTile tone="peach" size="md" className="rounded-full">
                    <Icon name="account_balance_wallet" size={18} />
                  </IconTile>
                }
                title={t('societyEarnings')}
                trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
                onClick={() => (window.location.href = '/mutha/earnings')}
              />
              <DataRow
                lead={
                  <IconTile tone="slate-pale" size="md" className="rounded-full">
                    <Icon name="shield" size={18} />
                  </IconTile>
                }
                title={t('societyInsurance')}
                trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
                onClick={() => (window.location.href = '/mutha/insurance')}
              />
              <DataRow
                lead={
                  <IconTile tone="peach" size="md" className="rounded-full">
                    <Icon name="hub" size={18} />
                  </IconTile>
                }
                title={t('operations')}
                trailing={<Icon name="chevron_right" size={18} className="text-fy-muted" />}
                onClick={() => (window.location.href = '/mutha/operations')}
              />
            </DataList>

            <DemandForecastWidget region={user?.region} accent="secondary" />
            <SupportAgentWidget accent="secondary" />
          </>
        )}

        {state !== 'loading' && !data && <EmptyState title={t('noSociety')} description={t('noSocietyHint')} />}

        {pendingRatingId && (
          <RatingModal bookingId={pendingRatingId} open accent="secondary" onDone={() => setPendingRatingId(null)} />
        )}
      </main>
    </div>
  );
}
