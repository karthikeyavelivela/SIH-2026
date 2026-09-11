'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { useBookingFlow, MAX_STOPS } from '@/lib/useBookingFlow';
import { bucketCategories } from '@/lib/categoryBuckets';
import { AddressField } from '@/components/booking/AddressField';
import { AddressChips } from '@/components/booking/AddressChips';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';
import { RotaryDial, type DialSector } from '@/components/ui/RotaryDial';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock } from '@/components/fy/Data';
import { Button, Chip, ChipRow, Stepper, SelectCard, Field } from '@/components/fy/Controls';
import { PhotoStrip } from '@/components/fy/Media';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/hamali_labour_standard.html.

   Section order there, top to bottom: 64px brand bar -> guild banner
   (eyebrow, serif title, live count) with the dial sliver -> duotone photo
   strip carrying a verified/insured caption -> "Consignment Scale" two
   tiles (standard / bulk) -> crew-size hero counter with the -/number/+
   trio and a live fair-wage total -> "Engagement Model" two cards ->
   "What's being handled?" material chips -> "Estimated Duration" chips ->
   pickup address box + saved-location quick picks -> union guarantee
   banner -> sticky action tray with the support dial and the primary CTA
   -> 5-tab bottom bar.

   Largest element: the crew-size number. Dark surfaces: the photo strip's
   duotone wash and the sticky tray's CTA. Everything else light on bone.

   The design's green/lime accent is the labour mode's accent throughout. */

/**
 * The material chips. These map onto the server's real GOODS_TYPES enum
 * (server/src/models/Booking.ts) — the design lists eight labels of its own
 * invention ("cement bags", "steel rods"), but only a value the enum accepts
 * can actually be stored, so each chip carries the enum value it submits.
 */
const MATERIALS: { key: string; goodsType: string; glyph: string }[] = [
  { key: 'construction', goodsType: 'construction_material', glyph: 'foundation' },
  { key: 'machinery', goodsType: 'industrial_machinery', glyph: 'precision_manufacturing' },
  { key: 'furniture', goodsType: 'furniture', glyph: 'chair' },
  { key: 'appliances', goodsType: 'electronics', glyph: 'kitchen' },
  { key: 'produce', goodsType: 'perishables', glyph: 'agriculture' },
  { key: 'household', goodsType: 'household_shifting', glyph: 'home' },
  { key: 'parcels', goodsType: 'documents_parcels', glyph: 'inventory_2' },
  { key: 'other', goodsType: 'other', glyph: 'more_horiz' },
];

const DIAL_SECTORS: DialSector[] = [
  { key: 'household', label: 'Household', glyph: 'home_repair_service' },
  { key: 'labour', label: 'Hamali', glyph: 'engineering' },
  { key: 'transport', label: 'Transit', glyph: 'local_shipping' },
];

/**
 * Past this many requested workers a single society's crew almost certainly
 * cannot cover the job. There is no multi-society dispatch endpoint (checked
 * server-side), so the bulk tile routes to a screen that says so honestly
 * rather than pretending an automatic multi-crew assembly flow exists.
 * Not exported: a Next App Router page.tsx may only export `default`.
 */
const LARGE_CREW_THRESHOLD = 15;

export default function LabourBookingPage() {
  const t = useTranslations('labourBooking');
  const router = useRouter();
  const { addresses: savedAddresses, save: saveAddress } = useSavedAddresses();
  const [materials, setMaterials] = useState<string[]>([]);
  const [duration, setDuration] = useState<'task' | 'half_day' | 'full_day'>('task');
  const [engagement, setEngagement] = useState<'per_person' | 'full_crew'>('per_person');

  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );
  // `general_labour` is the traditional hamali/loading-crew category.
  const category = useMemo(
    () => bucketCategories(categoriesState.data ?? []).labour[0],
    [categoriesState.data]
  );

  const flow = useBookingFlow({
    type: 'hamali',
    serviceCategorySlug: category?.slug,
    needsWeight: false,
    needsHamali: true,
  });

  function handleDialChange(key: string) {
    if (key === 'household') router.push('/customer/dashboard');
    else if (key === 'transport') router.push('/customer/book/transport');
  }

  function toggleMaterial(key: string) {
    setMaterials((m) => (m.includes(key) ? m.filter((x) => x !== key) : [...m, key]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // One goodsType field, several chips — the first selection is what the
    // enum can carry; the rest ride along in the description so nothing the
    // customer told us is silently dropped.
    const chosen = MATERIALS.filter((m) => materials.includes(m.key));
    await flow.submit(
      {
        goodsType: chosen[0]?.goodsType,
        description: chosen.length > 1 ? chosen.map((c) => t(`materials.${c.key}`)).join(', ') : undefined,
      },
      t('errorSubmit')
    );
  }

  const total = flow.fare?.total;

  return (
    <RotaryDial sectors={DIAL_SECTORS} activeKey="labour" onChange={handleDialChange}>
      <div className="min-h-screen bg-fy-bone relative">
        <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

        <TopBar eyebrow="FYRO Cooperative" title={t('title')} showBack />

        <form
          onSubmit={handleSubmit}
          className="pt-16 pb-44 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-5"
        >
          {/* Guild banner. The design reads "86 certified freight specialists
              ready near you"; nothing counts available workers server-side,
              so this carries the category's real dispatch description. */}
          <div className="pt-2 pr-20">
            <EyebrowLabel tone="green">{t('guildEyebrow')}</EyebrowLabel>
            <h2 className="font-heading text-heading text-fy-ink leading-[1.05] whitespace-pre-line">
              {t('headline')}
            </h2>
            <Body className="mt-1.5">{t('subhead')}</Body>
          </div>

          <PhotoStrip
            id="labour.crew"
            alt=""
            tint="labour"
            caption={
              <>
                <span className="flex items-center gap-1.5 min-w-0">
                  <Icon name="verified" size={16} />
                  <span className="font-body text-label truncate">{t('unionVerified')}</span>
                </span>
                <StatusPill tone="lime" className="shrink-0">
                  {t('insured')}
                </StatusPill>
              </>
            }
          />

          <Section title={<SectionHeading>{t('scaleHeading')}</SectionHeading>}>
            <div className="grid grid-cols-2 gap-3">
              <SelectCard
                selected
                glyph="swap_driving_apps_wheel"
                title={t('scaleStandard')}
                description={t('scaleStandardHint')}
                accent="green"
                onClick={() => undefined}
              />
              <SelectCard
                selected={false}
                glyph="forklift"
                title={t('scaleBulk')}
                description={t('scaleBulkHint')}
                accent="green"
                onClick={() => router.push('/customer/book/labour/bulk')}
              />
            </div>
          </Section>

          {/* Crew size — the screen's largest element. */}
          <Panel className="p-5 flex flex-col items-center gap-3">
            <div className="flex items-center gap-2 self-start">
              <IconTile tone="lime" size="sm">
                <Icon name="groups" size={18} />
              </IconTile>
              <div>
                <EyebrowLabel tone="green">{t('allocation')}</EyebrowLabel>
                <p className="font-body text-body font-semibold text-fy-ink">{t('crewSize')}</p>
              </div>
            </div>
            <Stepper
              value={flow.hamaliCount}
              onChange={flow.setHamaliCount}
              min={1}
              max={40}
              label={t('certifiedPorters')}
            />
            {flow.hamaliCount > LARGE_CREW_THRESHOLD && (
              <LightCard className="w-full flex items-start gap-2.5">
                <Icon name="info" size={18} className="text-fy-brown shrink-0 mt-px" />
                <Body size="label">{t('largeCrewNote')}</Body>
              </LightCard>
            )}
            <Divider className="w-full" />
            {/* A real quote from POST /api/bookings/quote, not a computed
                guess — it only appears once there is one. */}
            {flow.fareState === 'ready' && total != null ? (
              <MetricBlock
                className="w-full justify-center text-center"
                tone="green"
                label={t('fairWageTotal')}
                value={`₹${total}`}
                note={t('directPayout')}
              />
            ) : (
              <Body size="label" className="text-center">
                {flow.fareState === 'loading' ? t('quoting') : t('fareAfterAddress')}
              </Body>
            )}
          </Panel>

          <Section title={<SectionHeading>{t('engagementHeading')}</SectionHeading>}>
            <div className="flex flex-col gap-3">
              <SelectCard
                selected={engagement === 'per_person'}
                glyph="badge"
                title={t('engagementPerPerson')}
                description={t('engagementPerPersonHint')}
                accent="green"
                onClick={() => setEngagement('per_person')}
              />
              <SelectCard
                selected={engagement === 'full_crew'}
                glyph="diversity_3"
                title={t('engagementFullCrew')}
                description={t('engagementFullCrewHint')}
                accent="green"
                onClick={() => setEngagement('full_crew')}
              />
            </div>
          </Section>

          <Section
            title={<SectionHeading>{t('materialsHeading')}</SectionHeading>}
            aside={<EyebrowLabel>{t('selectAll')}</EyebrowLabel>}
          >
            <ChipRow>
              {MATERIALS.map((m) => (
                <Chip
                  key={m.key}
                  type="button"
                  shape="square"
                  accent="lime"
                  glyph={m.glyph}
                  active={materials.includes(m.key)}
                  onClick={() => toggleMaterial(m.key)}
                >
                  {t(`materials.${m.key}`)}
                </Chip>
              ))}
            </ChipRow>
          </Section>

          <Section title={<SectionHeading>{t('durationHeading')}</SectionHeading>}>
            <div className="grid grid-cols-3 gap-2">
              {(['task', 'half_day', 'full_day'] as const).map((d) => (
                <SelectCard
                  key={d}
                  compact
                  selected={duration === d}
                  title={t(`duration.${d}`)}
                  description={t(`duration.${d}Hint`)}
                  accent="green"
                  onClick={() => setDuration(d)}
                />
              ))}
            </div>
          </Section>

          <Section
            title={<SectionHeading>{t('pickupHeading')}</SectionHeading>}
            aside={
              flow.locatingDevice ? (
                <EyebrowLabel>{t('locating')}</EyebrowLabel>
              ) : (
                <EyebrowLabel tone="green">{t('gpsAccurate')}</EyebrowLabel>
              )
            }
          >
            <AddressField
              label={t('pickupLabel')}
              placeholder={t('pickupPlaceholder')}
              value={flow.pickup}
              onChange={flow.setPickup}
              markerColorClass="text-fy-green"
            />
            <AddressChips
              saved={savedAddresses}
              onPick={flow.setPickup}
              currentValue={flow.pickup}
              onSave={(label, point) => saveAddress(label, point.address, point.lat, point.lng)}
            />
            {flow.mismatch && (
              <LightCard className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Icon name="pin_drop" size={18} className="text-fy-brown shrink-0 mt-px" />
                  <Body size="label">{t('mismatchNote')}</Body>
                </div>
                <button
                  type="button"
                  onClick={flow.dismissMismatch}
                  className="shrink-0 font-body text-label font-semibold text-fy-brown hover:underline"
                >
                  {t('mismatchDismiss')}
                </button>
              </LightCard>
            )}
            <AddressField
              label={t('dropLabel')}
              placeholder={t('dropPlaceholder')}
              value={flow.drop}
              onChange={flow.setDrop}
              markerColorClass="text-fy-brown"
            />
            <AddressChips
              saved={savedAddresses}
              onPick={flow.setDrop}
              currentValue={flow.drop}
              onSave={(label, point) => saveAddress(label, point.address, point.lat, point.lng)}
              extraChip={
                flow.pickup ? { label: t('sameAsPickup'), onClick: () => flow.setDrop(flow.pickup) } : undefined
              }
            />
            {flow.stops.map((s, i) => (
              <AddressField
                key={i}
                label={t('stopLabel', { n: i + 1 })}
                placeholder={t('stopPlaceholder')}
                value={s}
                onChange={(v) => flow.setStops(flow.stops.map((old, j) => (j === i ? v! : old)))}
                markerColorClass="text-fy-slate"
              />
            ))}
            {flow.stops.length < MAX_STOPS && (
              <Button
                type="button"
                variant="ghost"
                size="md"
                glyph="add_location_alt"
                onClick={() => flow.setStops([...flow.stops, { lat: 0, lng: 0, address: '' }])}
              >
                {t('addStop')}
              </Button>
            )}
            <div>
              <EyebrowLabel>{t('regionLabel')}</EyebrowLabel>
              <Field
                value={flow.region}
                onChange={(e) => flow.setRegion(e.target.value)}
                placeholder={t('regionPlaceholder')}
              />
            </div>
          </Section>

          <LightCard className="flex items-center gap-3">
            <IconTile tone="green">
              <Icon name="handshake" size={20} />
            </IconTile>
            <div className="min-w-0">
              <p className="font-body text-label font-semibold text-fy-ink">{t('welfareTitle')}</p>
              <Body size="label">{t('welfareHint')}</Body>
            </div>
          </LightCard>

          {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} />}
          {flow.submitError && (
            <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
              {flow.submitError}
              {/* The server blocks a new booking until the last completed one
                  is rated. Telling the customer that without a way to get
                  there is a dead end, so link straight to the job. */}
              {flow.blockedByUnratedId && (
                <Link
                  href={`/customer/track/${flow.blockedByUnratedId}`}
                  className="block mt-2 font-semibold underline underline-offset-2"
                >
                  {t('rateLastJob')}
                </Link>
              )}
            </div>
          )}

          {/* Sticky action tray. Offset above the 64px bottom bar. */}
          <div className="fixed inset-x-0 bottom-16 z-30 bg-fy-bone/92 backdrop-blur-xl border-t border-fy-hairline/40">
            <div className="max-w-2xl mx-auto px-gutter py-3 flex items-center gap-3">
              <Button
                type="button"
                variant="light"
                size="md"
                glyph="support_agent"
                aria-label={t('supportDial')}
                onClick={() => router.push('/customer/support')}
                className="shrink-0"
              />
              <Button type="submit" variant="green" glyph="group_add" disabled={!flow.readyToQuote || flow.submitting} className="flex-1">
                {flow.submitting
                  ? t('submitting')
                  : total != null
                    ? t('continueWithTotal', { count: flow.hamaliCount, total })
                    : t('continueWithCount', { count: flow.hamaliCount })}
              </Button>
            </div>
          </div>
        </form>

      </div>
    </RotaryDial>
  );
}
