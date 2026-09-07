'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useIncomingOffer } from '@/lib/useIncomingOffer';
import { Booking, MuthaResponse } from '@/lib/types';
import { OfferCard } from '@/components/worker/OfferCard';
import { SelectableWorkerCard } from '@/components/ui/SelectableWorkerCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/society_requests.html.

   Section order there, top to bottom: 64px brand bar -> "Cooperative queue"
   eyebrow with a new-allocation count -> "Incoming Mandates" heading and
   blurb -> a society standing card -> "Priority crew dispatches" as one
   card per mandate, each carrying the route, the crew requirement with how
   many are still needed, the consignment, the collective yield and its
   per-worker split, and the member picker.

   Largest element: the heading, then each mandate's yield. Dark surfaces:
   the pushed offer plate. Green is the society accent.

   The per-worker figure is a real division of the booking's own hamali pool
   by the crew size it asks for, not an invented rate. The design's "94%
   Deployment" and "Active Mandi Fleet: 14 E-Trucks" have no source — a
   society stores members, not a fleet count or a deployment ratio — so the
   standing card carries the two figures that are real: how many members are
   ready, and how many mandates are open. */

const goodsGlyph: Record<string, string> = {
  construction_material: 'foundation',
  industrial_machinery: 'precision_manufacturing',
  perishables: 'agriculture',
  furniture: 'chair',
  electronics: 'devices',
  household_shifting: 'home',
  documents_parcels: 'inventory_2',
  general_goods: 'category',
  other: 'more_horiz',
};

function MemberPicker({
  booking,
  members,
  onAssigned,
}: {
  booking: Booking;
  members: MuthaResponse['members'];
  onAssigned: () => void;
}) {
  const t = useTranslations('muthaRequests');
  const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
  const onlineMembers = members.filter((m) => m.availabilityStatus === 'online');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < remaining ? [...prev, id] : prev
    );
  }

  async function assign() {
    setPending(true);
    setError(null);
    try {
      await api.post(`/api/requests/${booking._id}/accept`, { memberIds: selected });
      onAssigned();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorAssign'));
    } finally {
      setPending(false);
    }
  }

  async function reject() {
    setPending(true);
    try {
      await api.post(`/api/requests/${booking._id}/reject`);
      onAssigned();
    } finally {
      setPending(false);
    }
  }

  const weightKg = booking.cargoDetails?.weightKg ?? 0;
  const goodsType = booking.cargoDetails?.goodsType;
  const glyph = goodsType ? (goodsGlyph[goodsType] ?? 'engineering') : 'engineering';
  // The society's own crew pool for this booking, divided by the crew it
  // asks for — a real split of a real figure, not a quoted rate.
  const perWorker = booking.requiredHamaliCount
    ? Math.round((booking.fareBreakdown.hamaliFare || booking.fareBreakdown.total) / booking.requiredHamaliCount)
    : null;

  return (
    <Panel className="flex flex-col gap-3 animate-[scaleIn_250ms_ease-out]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <IconTile tone="lime" size="md">
            <Icon name={glyph} size={20} />
          </IconTile>
          <div className="min-w-0">
            <p className="font-body text-body font-semibold text-fy-ink truncate">
              {booking.pickupLocation.address.split(',')[0]} → {booking.dropLocation.address.split(',')[0]}
            </p>
            {booking.distanceKm > 0 && <Body size="label">{t('transit', { km: booking.distanceKm.toFixed(1) })}</Body>}
          </div>
        </div>
        <StatusPill tone={remaining > 0 ? 'neutral' : 'lime'} className="shrink-0">
          {t('needsMore', { count: remaining })}
        </StatusPill>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-control bg-fy-field p-3">
          <EyebrowLabel>{t('workersRequired')}</EyebrowLabel>
          <p className="font-heading text-heading text-fy-green leading-none">
            {String(booking.requiredHamaliCount).padStart(2, '0')}
          </p>
          <Body size="label">{t('assignedCount', { count: booking.assignedHamaliIds.length })}</Body>
        </div>
        <div className="rounded-control bg-fy-field p-3">
          <EyebrowLabel>{t('collectiveYield')}</EyebrowLabel>
          <p className="font-heading text-heading text-fy-ink leading-none">₹{booking.fareBreakdown.total}</p>
          {perWorker != null && <Body size="label">{t('perWorker', { amount: perWorker })}</Body>}
        </div>
      </div>

      {weightKg > 0 && (
        <div>
          <EyebrowLabel>{t('consignment')}</EyebrowLabel>
          <p className="font-body text-label font-semibold text-fy-ink">
            {(weightKg / 1000).toFixed(weightKg < 1000 ? 2 : 1)} T
            {goodsType ? ` · ${t(`goodsTypes.${goodsType}` as never) ?? goodsType}` : ''}
          </p>
        </div>
      )}

      <Divider />

      <div>
        <EyebrowLabel tone="green">{t('assignOnline', { selected: selected.length, remaining })}</EyebrowLabel>
        {onlineMembers.length === 0 ? (
          <Body size="label" className="mt-1">
            {t('noneOnline')}
          </Body>
        ) : (
          <div className="flex flex-col gap-1 mt-2">
            {onlineMembers.map((m) => {
              const checked = selected.includes(m._id);
              return (
                <SelectableWorkerCard
                  key={m._id}
                  name={m.name}
                  photoUrl={m.profilePhoto}
                  subtitle={t('currentlyActive')}
                  selected={checked}
                  disabled={!checked && selected.length >= remaining}
                  onToggle={() => toggle(m._id)}
                />
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="ghost" size="md" className="flex-1" disabled={pending} onClick={reject}>
          {t('reject')}
        </Button>
        <Button
          variant="green"
          size="md"
          glyph="group_add"
          className="flex-1"
          disabled={pending || selected.length !== remaining}
          onClick={assign}
        >
          {pending ? t('assigning') : t('assign', { count: selected.length || '' })}
        </Button>
      </div>
    </Panel>
  );
}

export default function MuthaRequestsPage() {
  const t = useTranslations('muthaRequests');
  const { data: requestsData, state, reload: reloadRequests } = usePolling(
    () => api.get<{ requests: Booking[] }>('/api/requests'),
    6000
  );
  const { data: muthaData, reload: reloadMutha } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 6000);
  const { offer, responding, respond } = useIncomingOffer();
  const [offerError, setOfferError] = useState<string | null>(null);

  async function onAssigned() {
    await Promise.all([reloadRequests(), reloadMutha()]);
  }

  async function respondToOffer(accept: boolean) {
    setOfferError(null);
    const ack = await respond(accept);
    if (!ack.ok && ack.error) setOfferError(ack.error);
    await reloadRequests();
  }

  const requests = requestsData?.requests ?? [];
  const members = muthaData?.members ?? [];
  const readyCount = members.filter((m) => m.availabilityStatus === 'online').length;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar eyebrow="FYRO Society" title={t('pageTitle')} />

      <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
        <div className="pt-2">
          <EyebrowLabel tone="green">{t('queueEyebrow', { count: requests.length })}</EyebrowLabel>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('mandatesHeading')}</h2>
          <Body className="mt-1.5">{t('pageSubtitle')}</Body>
        </div>

        {/* Society standing. The design shows a fleet count and a deployment
            percentage; a society stores members, not vehicles or a
            deployment ratio, so these are the two real figures. */}
        {muthaData && (
          <LightCard className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <IconTile tone="green" size="md">
                <Icon name="verified" size={20} />
              </IconTile>
              <div className="min-w-0">
                <p className="font-body text-label font-semibold text-fy-ink truncate">{muthaData.mutha.name}</p>
                <Body size="label">{t('crewReady', { ready: readyCount, total: members.length })}</Body>
              </div>
            </div>
            <StatusPill tone={readyCount > 0 ? 'lime' : 'outline'} className="shrink-0">
              {readyCount > 0 ? t('mustered') : t('noneReady')}
            </StatusPill>
          </LightCard>
        )}

        {offer && (
          <div className="flex flex-col gap-2">
            <OfferCard
              offer={offer}
              accent="secondary"
              responding={responding}
              acceptLabel={t('acceptAndAssign')}
              onAccept={() => respondToOffer(true)}
              onReject={() => respondToOffer(false)}
            />
            <Body size="label">{t('holdNotice')}</Body>
            {offerError && (
              <div role="alert" className="rounded-control bg-fy-error-bg px-3.5 py-2.5 font-body text-label text-fy-on-error-bg">
                {offerError}
              </div>
            )}
          </div>
        )}

        <Section
          title={<SectionHeading>{t('dispatchesHeading')}</SectionHeading>}
          aside={<EyebrowLabel>{t('openCount', { count: requests.length })}</EyebrowLabel>}
        >
          {state === 'loading' && (
            <div className="flex flex-col gap-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-56 rounded-card bg-fy-field animate-pulse" />
              ))}
            </div>
          )}

          {state !== 'loading' && requests.length === 0 && (
            <LightCard>
              <EmptyState title={t('noOpenRequests')} description={t('noOpenRequestsDesc')} />
            </LightCard>
          )}

          {requests.map((b) => (
            <MemberPicker key={b._id} booking={b} members={members} onAssigned={onAssigned} />
          ))}
        </Section>
      </main>
    </div>
  );
}
