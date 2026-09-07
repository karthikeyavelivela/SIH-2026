'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { useBookingFlow } from '@/lib/useBookingFlow';
import { bucketCategories } from '@/lib/categoryBuckets';
import { AddressField } from '@/components/booking/AddressField';
import { AddressChips } from '@/components/booking/AddressChips';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { StatRow, MetricBlock } from '@/components/fy/Data';
import { Button, Chip, ChipRow, Slider, Toggle, Stepper, Field } from '@/components/fy/Controls';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/hamali_labour_bulk.html.

   Section order there, top to bottom: back bar -> "Federation Grade /
   Class 4 · Heavy Bulk" sliver -> "Bulk consignment" editorial header ->
   tonnage hero with the big figure, the unit, and a four-stop slider ->
   an assembly banner -> material category tiles -> dispatch routing
   (pickup + drop) -> mechanical-assistance toggle -> coordination note ->
   itemised ledger card with a grand total -> lime CTA.

   Largest element: the tonnage figure. Dark surfaces: the ledger plate and
   the CTA. Green/lime is the labour mode's accent throughout.

   THE HONESTY PROBLEM ON THIS SCREEN, and what is rendered instead:
   the design presents automatic multi-society federation — "4 societies ·
   62 workers assembled", society avatars, a named Lead Marshal, and a fare
   itemised into three society rows totalling ₹1,42,800. None of that
   exists. There is no multi-society dispatch endpoint, no society-assembly
   mechanism, and no per-society fare split anywhere in the server; a
   booking has ONE crew count and ONE fare. So this screen keeps the
   design's shape and its real job — capture a large consignment properly —
   while stating plainly that coordination across societies is arranged by
   the cooperative's operations team rather than assembled automatically,
   and showing the one real quote instead of invented society rows. */

/**
 * Material tiles, mapped to the server's real GOODS_TYPES enum.
 */
const MATERIALS: { key: string; goodsType: string; glyph: string }[] = [
  { key: 'cement', goodsType: 'construction_material', glyph: 'foundation' },
  { key: 'steel', goodsType: 'construction_material', glyph: 'view_column' },
  { key: 'grain', goodsType: 'perishables', glyph: 'grain' },
  { key: 'machinery', goodsType: 'industrial_machinery', glyph: 'precision_manufacturing' },
  { key: 'construction', goodsType: 'construction_material', glyph: 'layers' },
  { key: 'mixed', goodsType: 'general_goods', glyph: 'category' },
];

/** The four stops on the design's tonnage slider, in tonnes. */
const TONNE_STOPS = [100, 500, 1000, 2000];

/**
 * Roughly how many porters a tonne of bulk freight needs, used only to seed
 * the crew stepper with a sensible starting number the customer then edits.
 * It is not a pricing input — the fare below always comes from the server's
 * own quote for whatever crew size is actually submitted.
 */
const TONNES_PER_PORTER = 8;

export default function LabourBulkPage() {
  const t = useTranslations('labourBulk');
  const router = useRouter();
  const { addresses: savedAddresses, save: saveAddress } = useSavedAddresses();
  const [tonnes, setTonnes] = useState(TONNE_STOPS[0]);
  const [material, setMaterial] = useState<string | null>(null);
  const [mechanical, setMechanical] = useState(false);
  const [crewTouched, setCrewTouched] = useState(false);

  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );
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

  // Suggested crew follows the tonnage until the customer sets it by hand.
  const suggestedCrew = Math.max(1, Math.round(tonnes / TONNES_PER_PORTER / (mechanical ? 2 : 1)));
  const crew = crewTouched ? flow.hamaliCount : suggestedCrew;
  function setTonnesAndCrew(v: number) {
    setTonnes(v);
    if (!crewTouched) flow.setHamaliCount(Math.max(1, Math.round(v / TONNES_PER_PORTER / (mechanical ? 2 : 1))));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const chosen = MATERIALS.find((m) => m.key === material);
    await flow.submit(
      {
        goodsType: chosen?.goodsType,
        description: t('bookingDescription', {
          tonnes,
          material: chosen ? t(`materials.${chosen.key}`) : t('materialsUnspecified'),
          mechanical: mechanical ? t('mechanicalYes') : t('mechanicalNo'),
        }),
      },
      t('errorSubmit')
    );
  }

  const fare = flow.fare;

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

      <TopBar title={t('title')} showBack onBack={() => router.push('/customer/book/labour')} />

      <form
        onSubmit={handleSubmit}
        className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-5"
      >
        <div className="flex items-center justify-between gap-3 pt-2">
          <EyebrowLabel tone="green">{t('gradeEyebrow')}</EyebrowLabel>
          <StatusPill tone="outline" className="shrink-0">
            {t('gradeClass')}
          </StatusPill>
        </div>

        <div>
          <h2 className="font-heading text-heading text-fy-ink leading-[1.05]">{t('headline')}</h2>
          <Body className="mt-1.5">{t('subhead')}</Body>
        </div>

        {/* Tonnage — the screen's largest element. */}
        <Panel className="p-5 flex flex-col gap-3">
          <EyebrowLabel>{t('volumeEyebrow')}</EyebrowLabel>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-metric text-fy-green tabular-nums">{tonnes.toLocaleString('en-IN')}</span>
            <span className="font-body text-body-lg text-fy-ink-soft">{t('tonnesUnit')}</span>
          </div>
          <Slider
            accent="green"
            min={TONNE_STOPS[0]}
            max={TONNE_STOPS[TONNE_STOPS.length - 1]}
            step={10}
            value={tonnes}
            onChange={(e) => setTonnesAndCrew(Number(e.target.value))}
            aria-label={t('volumeEyebrow')}
          />
          <div className="flex items-center justify-between">
            {TONNE_STOPS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTonnesAndCrew(v)}
                className="font-body text-eyebrow uppercase text-fy-muted hover:text-fy-ink"
              >
                {t('tonneStop', { v })}
              </button>
            ))}
          </div>
        </Panel>

        {/* The design shows "4 societies · 62 workers assembled" with a stack
            of society avatars. Nothing assembles societies; a booking carries
            one crew count. So this is that crew count, editable, with the
            honest note about who coordinates the rest. */}
        <Panel className="p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <IconTile tone="lime" size="sm">
              <Icon name="groups" size={18} />
            </IconTile>
            <div>
              <EyebrowLabel tone="green">{t('crewEyebrow')}</EyebrowLabel>
              <p className="font-body text-body font-semibold text-fy-ink">{t('crewTitle')}</p>
            </div>
          </div>
          <Stepper
            value={crew}
            onChange={(n) => {
              setCrewTouched(true);
              flow.setHamaliCount(n);
            }}
            min={1}
            max={200}
            label={t('porters')}
          />
          {!crewTouched && <Body size="label" className="text-center">{t('crewSuggested')}</Body>}
        </Panel>

        <Section
          title={<SectionHeading>{t('materialHeading')}</SectionHeading>}
          aside={<EyebrowLabel>{t('materialAside')}</EyebrowLabel>}
        >
          <ChipRow>
            {MATERIALS.map((m) => (
              <Chip
                key={m.key}
                type="button"
                shape="square"
                accent="lime"
                glyph={m.glyph}
                active={material === m.key}
                onClick={() => setMaterial(material === m.key ? null : m.key)}
              >
                {t(`materials.${m.key}`)}
              </Chip>
            ))}
          </ChipRow>
        </Section>

        <Section title={<SectionHeading>{t('routingHeading')}</SectionHeading>}>
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
          <AddressField
            label={t('dropLabel')}
            placeholder={t('dropPlaceholder')}
            value={flow.drop}
            onChange={flow.setDrop}
            markerColorClass="text-fy-brown"
          />
          <div>
            <EyebrowLabel>{t('regionLabel')}</EyebrowLabel>
            <Field
              value={flow.region}
              onChange={(e) => flow.setRegion(e.target.value)}
              placeholder={t('regionPlaceholder')}
            />
          </div>
        </Section>

        <LightCard className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <IconTile tone="slate-pale" size="sm">
              <Icon name="precision_manufacturing" size={18} />
            </IconTile>
            <div className="min-w-0">
              <p className="font-body text-label font-semibold text-fy-ink">{t('mechanicalTitle')}</p>
              <Body size="label">{t('mechanicalHint')}</Body>
            </div>
          </div>
          <Toggle
            checked={mechanical}
            onChange={(v) => {
              setMechanical(v);
              if (!crewTouched) {
                flow.setHamaliCount(Math.max(1, Math.round(tonnes / TONNES_PER_PORTER / (v ? 2 : 1))));
              }
            }}
            label={t('mechanicalTitle')}
          />
        </LightCard>

        {/* The design promises a named Lead Marshal society and "0 fractured
            sub-contracts". There is no federation-assembly mechanism to make
            that true, so this says what actually happens. */}
        <LightCard className="flex items-start gap-3">
          <Icon name="verified_user" size={20} className="text-fy-brown shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-body text-label font-semibold text-fy-ink">{t('coordinationTitle')}</p>
            <Body size="label" className="mt-0.5">
              {t('coordinationBody')}
            </Body>
          </div>
        </LightCard>

        {/* The design itemises the fare by society. A booking has one fare,
            so this shows that one — from the server's own quote. */}
        <div className="rounded-sheet bg-fy-green text-fy-on-green p-5 shadow-card flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <EyebrowLabel tone="on-dark" className="opacity-80">
              {t('ledgerEyebrow')}
            </EyebrowLabel>
            <StatusPill tone="lime" className="shrink-0">
              {t('standardScale')}
            </StatusPill>
          </div>
          {flow.fareState === 'ready' && fare ? (
            <>
              <div className="flex flex-col gap-2">
                <StatRow label={t('baseFare')} value={`₹${fare.baseFare}`} className="text-fy-on-green" />
                <StatRow label={t('crewFare', { count: crew })} value={`₹${fare.hamaliFare}`} className="text-fy-on-green" />
                {fare.distanceFare > 0 && (
                  <StatRow label={t('distanceFare')} value={`₹${fare.distanceFare}`} className="text-fy-on-green" />
                )}
              </div>
              <Divider className="border-fy-bone/20" />
              <MetricBlock onDark tone="lime" label={t('grandTotal')} value={`₹${fare.total}`} note={t('payoutNote')} />
            </>
          ) : (
            <Body tone="on-dark" size="label" className="opacity-90">
              {flow.fareState === 'loading'
                ? t('quoting')
                : flow.fareState === 'error'
                  ? (flow.fareError ?? t('errorSubmit'))
                  : t('fareAfterAddress')}
            </Body>
          )}
        </div>

        {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} />}
        {flow.submitError && (
          <div role="alert" className="rounded-control bg-fy-error-bg px-4 py-3 font-body text-label text-fy-on-error-bg">
            {flow.submitError}
          </div>
        )}

        <Button
          type="submit"
          variant="lime"
          glyph="local_shipping"
          trailingGlyph="arrow_forward"
          disabled={!flow.readyToQuote || flow.submitting}
          className="w-full"
        >
          {flow.submitting ? t('submitting') : t('submit')}
        </Button>
        <Body size="label" className="text-center">
          {t('settlementNote')}
        </Body>
      </form>

    </div>
  );
}
