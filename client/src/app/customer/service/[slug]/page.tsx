'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { useBookingFlow } from '@/lib/useBookingFlow';
import { usePublishedRates } from '@/lib/usePublishedRates';
import { AddressField } from '@/components/booking/AddressField';
import { AddressChips } from '@/components/booking/AddressChips';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button, Chip, ChipRow, SelectCard, Field } from '@/components/fy/Controls';
import { PhotoCard } from '@/components/fy/Media';
import { TopBar, TabRow } from '@/components/fy/Navigation';
import { CustomerTabBar } from '@/components/fy/CustomerTabBar';

/* Built against client/public/design/service_detail_booking_1.html.

   Section order there, top to bottom: back bar ("Service Booking Flow")
   -> guild-verified eyebrow + "Standard Guild Rate" -> the service name
   as the display heading with its fixed tariff beside it -> a direct-to-
   passbook assurance line -> "Select Unit Issue" multi-select chips ->
   a unit/specification plate -> "Service Location" with saved addresses
   and a dispatch-zone line -> "Preferred Dispatch Slot" Now/Later with
   slot cards -> sticky CTA -> bottom bar.

   Largest element: the service name. Dark surfaces: the hero scrim and
   the sticky CTA. Brown is the household mode's accent throughout.

   The design's "upload unit photo or error code tag" has no endpoint
   behind it — see the comment at that section for what replaces it. */

/**
 * The issue chips. Nothing server-side enumerates per-category symptoms, so
 * these are a fixed household set and what the customer picks is written
 * into the booking's own description field, which is real and reaches the
 * worker — rather than into an invented "unit issue" column.
 */
const ISSUES = [
  'not_working',
  'intermittent',
  'leak',
  'noise',
  'smell',
  'installation',
  'routine',
  'other',
] as const;

/** Now, or one of the next few slots. Maps to the real `scheduledFor` field. */
const SLOT_OFFSETS_MIN = [90, 180, 1080, 1260];

/** Server floor on a scheduled booking — booking.controller.ts's MIN_LEAD_MS. */
const MIN_LEAD_MIN = 35;

export default function ServiceDetailPage() {
  const t = useTranslations('serviceDetail');
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug;
  const { addresses: savedAddresses, save: saveAddress } = useSavedAddresses();
  const { rateFor } = usePublishedRates();
  const [issues, setIssues] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [slot, setSlot] = useState(0);

  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );
  const category = useMemo(
    () => (categoriesState.data ?? []).find((c) => c.slug === slug),
    [categoriesState.data, slug]
  );

  const flow = useBookingFlow({
    type: category?.dispatchType === 'truck' ? 'truck' : 'hamali',
    serviceCategorySlug: slug,
    needsWeight: category?.dispatchType === 'truck',
    needsHamali: category?.dispatchType !== 'truck',
  });

  const slots = useMemo(
    () => SLOT_OFFSETS_MIN.map((m) => new Date(Date.now() + m * 60 * 1000)),
    []
  );

  function toggleIssue(k: string) {
    setIssues((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const chosen = issues.map((k) => t(`issues.${k}`)).join(', ');
    const description = [chosen, notes.trim()].filter(Boolean).join(' — ');
    // 'now' sends no scheduledFor at all, which is the API's own contract
    // for an instant booking.
    if (when === 'later') {
      const picked = slots[slot];
      const leadMin = (picked.getTime() - Date.now()) / 60000;
      if (leadMin < MIN_LEAD_MIN) {
        // Server would reject it; say so here rather than after a round trip.
        return;
      }
      flow.setScheduledFor(picked.toISOString().slice(0, 16));
    }
    await flow.submit({ description: description || undefined }, t('errorSubmit'));
  }

  const rate = category ? rateFor(category) : undefined;

  if (categoriesState.status === 'loading') {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('title')} showBack />
        <main className="pt-16 px-gutter max-w-2xl mx-auto">
          <Skeleton lines={5} className="h-20" />
        </main>
      </div>
    );
  }
  if (categoriesState.status === 'error') {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('title')} showBack />
        <main className="pt-16 px-gutter max-w-2xl mx-auto">
          <ErrorState onRetry={categoriesState.reload} />
        </main>
      </div>
    );
  }
  if (!category) {
    return (
      <div className="min-h-screen bg-fy-bone">
        <TopBar title={t('title')} showBack />
        <main className="pt-16 px-gutter max-w-2xl mx-auto">
          <EmptyState
            title={t('notFoundTitle')}
            description={t('notFoundBody')}
            action={
              <Button size="md" onClick={() => router.push('/customer/dashboard')}>
                {t('backToServices')}
              </Button>
            }
          />
        </main>
        <CustomerTabBar />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar title={t('title')} showBack />

      <form
        onSubmit={handleSubmit}
        className="pt-16 pb-44 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-5"
      >
        <PhotoCard
          id={`household.category.${category.slug}`}
          alt={category.name}
          height="banner"
          scrim="brown"
          className="shadow-card mt-2"
          topLeft={
            category.guaranteeEligible ? <StatusPill tone="lime">{t('guildVerified')}</StatusPill> : undefined
          }
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <EyebrowLabel tone="brown">{t('standardRate')}</EyebrowLabel>
            <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{category.name}</h2>
          </div>
          {rate && (
            <div className="text-right shrink-0">
              <EyebrowLabel>{t('from')}</EyebrowLabel>
              <p className="font-heading text-metric text-fy-brown leading-none">₹{rate.minimumFare}</p>
              <EyebrowLabel>{t(`pricingUnit.${category.pricingUnit}` as never)}</EyebrowLabel>
            </div>
          )}
        </div>

        <LightCard className="flex items-start gap-2.5">
          <Icon name="verified" size={18} className="text-fy-green shrink-0 mt-px" />
          <Body size="label">{t('directToPassbook')}</Body>
        </LightCard>

        <Section
          title={<SectionHeading>{t('issuesHeading')}</SectionHeading>}
          aside={<EyebrowLabel>{t('multipleChoices')}</EyebrowLabel>}
        >
          <ChipRow>
            {ISSUES.map((k) => (
              <Chip
                key={k}
                type="button"
                shape="square"
                accent="brown"
                active={issues.includes(k)}
                onClick={() => toggleIssue(k)}
              >
                {t(`issues.${k}`)}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        {/* The design offers a photo/error-code upload here. There is no
            endpoint that accepts a photo against a booking — the only upload
            routes are KYC documents and worker proof-of-delivery photos, both
            gated to other roles — so rather than a control that silently
            drops what the customer attaches, this is a note that reaches the
            worker through the booking's real description field. */}
        <Section
          title={<SectionHeading>{t('detailsHeading')}</SectionHeading>}
          aside={<EyebrowLabel>{t('optional')}</EyebrowLabel>}
        >
          <Field
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('detailsPlaceholder')}
            maxLength={300}
          />
          <Body size="label">{t('detailsHint')}</Body>
        </Section>

        <Section title={<SectionHeading>{t('locationHeading')}</SectionHeading>}>
          <AddressField
            label={t('addressLabel')}
            placeholder={t('addressPlaceholder')}
            value={flow.pickup}
            onChange={(p) => {
              flow.setPickup(p);
              // A household visit happens at one address; the API still wants
              // both points, so the drop mirrors the pickup.
              flow.setDrop(p);
            }}
            markerColorClass="text-fy-brown"
          />
          <AddressChips
            saved={savedAddresses}
            onPick={(p) => {
              flow.setPickup(p);
              flow.setDrop(p);
            }}
            currentValue={flow.pickup}
            onSave={(label, point) => saveAddress(label, point.address, point.lat, point.lng)}
          />
          {flow.region && (
            <span className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-fy-well">
              <Icon name="near_me" size={14} className="text-fy-brown" />
              <EyebrowLabel>{t('dispatchZone', { region: flow.region })}</EyebrowLabel>
            </span>
          )}
        </Section>

        <Section title={<SectionHeading>{t('slotHeading')}</SectionHeading>}>
          <TabRow
            variant="segment"
            active={when}
            onChange={(k) => setWhen(k as 'now' | 'later')}
            tabs={[
              { key: 'now', label: t('now') },
              { key: 'later', label: t('later') },
            ]}
          />
          {when === 'later' && (
            <div className="grid grid-cols-2 gap-2">
              {slots.map((d, i) => (
                <SelectCard
                  key={i}
                  compact
                  selected={slot === i}
                  accent="lime"
                  title={d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
                  description={t('slotHint')}
                  onClick={() => setSlot(i)}
                />
              ))}
            </div>
          )}
          {when === 'now' && <Body size="label">{t('nowHint')}</Body>}
        </Section>

        {flow.submitError && (
          <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
            {flow.submitError}
          </div>
        )}

        <div className="fixed inset-x-0 bottom-16 z-30 bg-fy-bone/92 backdrop-blur-xl border-t border-fy-hairline/40">
          <div className="max-w-2xl mx-auto px-gutter py-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <EyebrowLabel>{flow.fareState === 'ready' ? t('estimated') : t('fareAfterAddress')}</EyebrowLabel>
              {flow.fareState === 'ready' && flow.fare && (
                <p className="font-heading text-title text-fy-ink leading-none">₹{flow.fare.total}</p>
              )}
            </div>
            <Button type="submit" glyph="bolt" disabled={!flow.readyToQuote || flow.submitting} className="shrink-0">
              {flow.submitting ? t('submitting') : t('submit')}
            </Button>
          </div>
        </div>
      </form>

      <CustomerTabBar />
    </div>
  );
}
