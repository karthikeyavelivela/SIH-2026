'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useBookingSocket } from '@/lib/useBookingSocket';
import { Booking, MuthaMemberGroupInfo } from '@/lib/types';
import { OnlineToggle } from '@/components/worker/OnlineToggle';
import { ChatPanel } from '@/components/worker/ChatPanel';
import { RatingModal } from '@/components/worker/RatingModal';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { StatRow } from '@/components/fy/Data';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/crew_job_assignment.html.

   Section order there, top to bottom: 64px brand bar -> "Active crew
   assignment" with a shift badge -> the consignment task card -> the work
   site with its report-by time -> the payout -> the crew leader card with
   a call action -> the job chat.

   Largest element: the site name, then the payout. Dark surfaces: the
   assignment header plate. Green is the crew accent.

   A member does not control their own job state — the leader starts and
   completes it (bookingAssignment.service.ts) — so this screen has no
   stage buttons, and says so rather than showing controls that would 403.

   The design's "Report by 06:30 · in 25 mins" needs a per-member reporting
   time; a booking has a schedule, not a per-crew call time, so the card
   shows the booking's own scheduled time when one exists. */

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

export default function MuthaMemberJobPage() {
  const t = useTranslations('muthaMemberJob');
  const { user } = useAuth();
  const [status, setStatus] = useState<'online' | 'offline' | 'on_job' | null>(null);
  // The mandatory rating gate actually blocks the LEADER from re-assigning
  // this member to a new job, not anything the member does directly — so
  // without this prompt a member cannot discover they owe a rating until
  // their leader hits a cryptic 403 trying to assign them.
  const [pendingRatingId, setPendingRatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ availabilityStatus: 'online' | 'offline' | 'on_job' }>('/api/availability')
      .then((res) => setStatus(res.availabilityStatus))
      .catch((err) => {
        if (err instanceof ApiClientError) setStatus(null);
      });
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => {});
  }, []);

  const { data } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 6000);
  const activeJob = data?.bookings.find((b) => b.status === 'accepted' || b.status === 'in_progress');
  const { messages, sendChat } = useBookingSocket(activeJob?._id);
  const { data: groupInfo } = usePolling(() => api.get<MuthaMemberGroupInfo>('/api/mutha/my-group'), 30000);

  const firstName = user?.name?.split(' ')[0] ?? '';
  const weightKg = activeJob?.cargoDetails?.weightKg ?? 0;
  // The member's own share of the crew pool for this job.
  const share =
    activeJob && activeJob.requiredHamaliCount
      ? Math.round((activeJob.fareBreakdown.hamaliFare || activeJob.fareBreakdown.total) / activeJob.requiredHamaliCount)
      : null;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar
        eyebrow="FYRO Crew"
        title={t('pageTitle')}
        actions={<NotificationBell href="/mutha-member/notifications" />}
      />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone="green">{t('assignmentEyebrow')}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">
            {firstName ? t('greeting', { name: firstName }) : t('greetingNoName')}
          </h2>
        </div>

        {status !== null && <OnlineToggle status={status} onStatusChange={(s) => setStatus(s)} accent="secondary" />}

        {groupInfo && (
          <Panel className="flex items-center gap-3">
            <Avatar name={groupInfo.leader.name} photoUrl={groupInfo.leader.profilePhoto} accent="secondary" />
            <div className="min-w-0 flex-1">
              <EyebrowLabel tone="green">{t('crewLeader')}</EyebrowLabel>
              <p className="font-body text-body font-semibold text-fy-ink truncate">{groupInfo.leader.name}</p>
              <Body size="label" className="truncate">
                {groupInfo.mutha.name}
              </Body>
            </div>
            {/* The leader's number IS shared with their own crew — my-group
                returns it deliberately, unlike a customer's. */}
            {groupInfo.leader.phone && (
              <a
                href={`tel:${groupInfo.leader.phone}`}
                aria-label={t('callLeader')}
                className="w-11 h-11 rounded-full bg-fy-green text-fy-on-green flex items-center justify-center shrink-0"
              >
                <Icon name="call" size={18} />
              </a>
            )}
          </Panel>
        )}

        {!activeJob ? (
          <LightCard>
            <EmptyState title={t('noJobTitle')} description={t('noJobDesc')} />
          </LightCard>
        ) : (
          <>
            {/* Assignment plate — the screen's anchor. */}
            <div className="bg-fy-green text-fy-on-green rounded-sheet p-5 shadow-card flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <EyebrowLabel tone="on-dark" className="opacity-80">
                    {t('consignmentTask')}
                  </EyebrowLabel>
                  <p className="font-heading text-title text-fy-bone truncate">
                    {activeJob.pickupLocation.address.split(',')[0]}
                  </p>
                </div>
                <StatusPill tone="lime" className="shrink-0">
                  {t(`status.${activeJob.status}` as never) ?? activeJob.status}
                </StatusPill>
              </div>
              <Divider className="border-fy-bone/20" />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <EyebrowLabel tone="on-dark" className="opacity-80">
                    {t('yourShare')}
                  </EyebrowLabel>
                  <p className="font-heading text-metric text-fy-lime leading-none">
                    {share != null ? `₹${share}` : '—'}
                  </p>
                </div>
                {weightKg > 0 && (
                  <div className="text-right">
                    <EyebrowLabel tone="on-dark" className="opacity-80">
                      {t('load')}
                    </EyebrowLabel>
                    <p className="font-body text-body font-semibold text-fy-bone">
                      {(weightKg / 1000).toFixed(weightKg < 1000 ? 2 : 1)} T
                    </p>
                  </div>
                )}
              </div>
            </div>

            <RouteMap
              pickup={{ lat: activeJob.pickupLocation.coordinates[1], lng: activeJob.pickupLocation.coordinates[0] }}
              drop={{ lat: activeJob.dropLocation.coordinates[1], lng: activeJob.dropLocation.coordinates[0] }}
              className="h-48 rounded-card overflow-hidden"
            />

            <Panel className="flex flex-col gap-2">
              <EyebrowLabel>{t('workSite')}</EyebrowLabel>
              <StatRow stacked label={t('reportTo')} value={activeJob.pickupLocation.address} />
              <StatRow stacked label={t('destination')} value={activeJob.dropLocation.address} />
              {activeJob.scheduledFor && (
                <StatRow
                  label={t('scheduledFor')}
                  value={new Date(activeJob.scheduledFor).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                />
              )}
            </Panel>

            <LightCard className="flex items-start gap-2.5">
              <Icon name="info" size={18} className="text-fy-green shrink-0 mt-px" />
              <Body size="label">{t('leaderControlsNote')}</Body>
            </LightCard>

            <Section title={<SectionHeading>{t('chatHeading')}</SectionHeading>}>
              <ChatPanel messages={messages} currentUserId={user?._id} onSend={sendChat} accent="secondary" />
            </Section>
          </>
        )}

        {pendingRatingId && (
          <RatingModal
            bookingId={pendingRatingId}
            open
            accent="secondary"
            title={t('rateLastCustomer')}
            onDone={() => setPendingRatingId(null)}
          />
        )}
      </main>
    </div>
  );
}
