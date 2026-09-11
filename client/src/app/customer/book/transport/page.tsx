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
import { bucketVehicleCategory } from '@/components/booking/FareCard';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';
import { RotaryDial, type DialSector } from '@/components/ui/RotaryDial';
import { Icon } from '@/components/ui/Icon';
import { ErrorState } from '@/components/ui/ErrorState';
import { LightCard, Panel, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { StatRow, MetricBlock } from '@/components/fy/Data';
import { Button, Chip, ChipRow, Slider, SelectCard, Field, Stepper } from '@/components/fy/Controls';
import { PhotoCard } from '@/components/fy/Media';
import { TopBar } from '@/components/fy/Navigation';

/* Built against client/public/design/goods_transport.html.

   Section order there, top to bottom: 64px brand bar -> context sliver
   ("Transit Dispatch · Mode 03" + Fleet Ready pill) -> full-bleed hero
   photo card under a slate scrim with the display heading -> consignment
   load controller (big tonnage figure + slider + suggested vehicle class
   plate) -> consignment strategy cards (single vs multiple vehicles) ->
   cargo classification chips -> declared value with the e-way threshold
   strip -> haulage path (origin, stops, destination, priced-for chip) ->
   hamali cross-sell strip in lime -> fare breakdown plate + slate CTA ->
   5-tab bottom bar.

   Largest element: the tonnage figure. Dark surfaces: the hero scrim, the
   suggested-vehicle plate and the fare plate. Slate is this mode's accent
   throughout, per every selected state on the screen. */

/**
 * Cargo classification chips, mapped to the server's real GOODS_TYPES enum
 * (server/src/models/Booking.ts). The design lists its own labels; only a
 * value the enum accepts can be stored.
 */
const CARGO: { key: string; goodsType: string; glyph: string }[] = [
  { key: 'construction', goodsType: 'construction_material', glyph: 'foundation' },
  { key: 'machinery', goodsType: 'industrial_machinery', glyph: 'precision_manufacturing' },
  { key: 'perishables', goodsType: 'perishables', glyph: 'nest_eco_leaf' },
  { key: 'furniture', goodsType: 'furniture', glyph: 'chair' },
  { key: 'electronics', goodsType: 'electronics', glyph: 'devices' },
  { key: 'household', goodsType: 'household_shifting', glyph: 'home' },
  { key: 'parcels', goodsType: 'documents_parcels', glyph: 'inventory_2' },
  { key: 'general', goodsType: 'general_goods', glyph: 'category' },
];

/** CGST Rules, rule 138 — the real e-way bill threshold. */
const EWAY_BILL_THRESHOLD_RUPEES = 50000;

const DIAL_SECTORS: DialSector[] = [
  { key: 'household', label: 'Household', glyph: 'home_repair_service' },
  { key: 'labour', label: 'Hamali', glyph: 'engineering' },
  { key: 'transport', label: 'Transit', glyph: 'local_shipping' },
];

/** The four stops on the design's load slider, in kilograms. */
const LOAD_STOPS = [500, 15000, 40000, 120000];
const DEFAULT_LOAD_KG = 15000;

export default function TransportBookingPage() {
  const t = useTranslations('transportBooking');
  const router = useRouter();
  const { addresses: savedAddresses, save: saveAddress } = useSavedAddresses();
  const [cargo, setCargo] = useState<string | null>(null);
  const [estimatedValue, setEstimatedValue] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  const [strategy, setStrategy] = useState<'single' | 'split'>('single');
  const [vehicleCount, setVehicleCount] = useState(2);
  const [addHamali, setAddHamali] = useState(false);

  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );
  const category = useMemo(
    () => bucketCategories(categoriesState.data ?? []).transport[0],
    [categoriesState.data]
  );

  // Adding a loading crew to a vehicle job is exactly what the server's
  // 'combo' dispatch type is: a truck AND hamali workers on one booking.
  const flow = useBookingFlow({
    type: addHamali ? 'combo' : 'truck',
    serviceCategorySlug: category?.slug,
    needsWeight: true,
    needsHamali: addHamali,
  });

  // Mid-range default so the slider opens somewhere useful rather than at
  // its floor — the design opens at a lorry-sized load, not a 500kg one.
  const weightKg = Number(flow.weightKg) || DEFAULT_LOAD_KG;
  const vehicleClass = bucketVehicleCategory(weightKg);
  const ewayRequired = Number(estimatedValue) >= EWAY_BILL_THRESHOLD_RUPEES;

  function handleDialChange(key: string) {
    if (key === 'household') router.push('/customer/dashboard');
    else if (key === 'labour') router.push('/customer/book/labour');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await flow.submit(
      {
        goodsType: cargo ? CARGO.find((c) => c.key === cargo)?.goodsType : undefined,
        estimatedValueRupees: estimatedValue ? Number(estimatedValue) : undefined,
        ewayBillNumber: ewayRequired && ewayBillNumber ? ewayBillNumber : undefined,
      },
      t('errorSubmit')
    );
  }

  const fare = flow.fare;

  return (
    <RotaryDial sectors={DIAL_SECTORS} activeKey="transport" onChange={handleDialChange}>
      <div className="min-h-screen bg-fy-bone relative">
        <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

        <TopBar eyebrow="FYRO Cooperative" title={t('title')} showBack />

        <form
          onSubmit={handleSubmit}
          className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-5"
        >
          <div className="flex items-center justify-between gap-3 pt-2 pr-20">
            <EyebrowLabel tone="brown">{t('modeSliver')}</EyebrowLabel>
            <StatusPill tone="slate" className="shrink-0">
              {t('fleetReady')}
            </StatusPill>
          </div>

          <PhotoCard
            id="transport.hero"
            alt=""
            height="hero"
            scrim="slate"
            tint="transport"
            className="shadow-card"
            topLeft={
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-fy-card/92 backdrop-blur-md font-body text-eyebrow uppercase text-fy-ink">
                <Icon name="hub" size={14} className="text-fy-slate" />
                {t('corridor')}
              </span>
            }
            overlay={
              <div>
                <EyebrowLabel tone="on-dark" className="opacity-80">
                  {t('heroEyebrow')}
                </EyebrowLabel>
                <h2 className="font-heading text-heading text-fy-bone leading-[1.05]">{t('headline')}</h2>
                <Body tone="on-dark" className="mt-1 opacity-90">
                  {t('subhead')}
                </Body>
              </div>
            }
          />

          {/* Consignment load — the screen's largest element. */}
          <Panel className="p-5 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <EyebrowLabel>{t('loadEyebrow')}</EyebrowLabel>
                <p className="font-body text-body font-semibold text-fy-ink">{t('loadTitle')}</p>
              </div>
              <Icon name="balance" size={22} className="text-fy-muted shrink-0" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-heading text-metric text-fy-slate tabular-nums">
                {(weightKg / 1000).toFixed(weightKg < 1000 ? 2 : 1)}
              </span>
              <span className="font-body text-body-lg text-fy-ink-soft">{t('tonnes')}</span>
            </div>
            <Slider
              accent="slate"
              min={LOAD_STOPS[0]}
              max={LOAD_STOPS[LOAD_STOPS.length - 1]}
              step={500}
              value={weightKg}
              onChange={(e) => flow.setWeightKg(e.target.value)}
              aria-label={t('loadTitle')}
            />
            <div className="flex items-center justify-between">
              {LOAD_STOPS.map((kg) => (
                <button
                  key={kg}
                  type="button"
                  onClick={() => flow.setWeightKg(String(kg))}
                  className="font-body text-eyebrow uppercase text-fy-muted hover:text-fy-ink"
                >
                  {t(`loadStop.${kg}`)}
                </button>
              ))}
            </div>
            <Divider />
            {/* The vehicle class the SERVER will price against — the exact
                same bucketing function booking pricing uses, not a separate
                marketing claim about a named truck model. */}
            <div className="flex items-center gap-3">
              <IconTile tone="slate">
                <Icon name="local_shipping" size={20} />
              </IconTile>
              <div className="min-w-0">
                <EyebrowLabel>{t('suggestedClass')}</EyebrowLabel>
                <p className="font-body text-body font-semibold text-fy-ink">{t(`vehicleClass.${vehicleClass}`)}</p>
                <Body size="label">{t(`vehicleClassHint.${vehicleClass}`)}</Body>
              </div>
            </div>
          </Panel>

          <Section title={<SectionHeading>{t('strategyHeading')}</SectionHeading>}>
            <div className="flex flex-col gap-3">
              <SelectCard
                selected={strategy === 'single'}
                glyph="pin_invoke"
                accent="slate"
                title={t('strategySingle')}
                description={t('strategySingleHint')}
                onClick={() => setStrategy('single')}
              />
              <SelectCard
                selected={strategy === 'split'}
                glyph="call_split"
                accent="slate"
                title={t('strategySplit')}
                description={t('strategySplitHint')}
                badge={<StatusPill tone="lime">{t('optimal')}</StatusPill>}
                onClick={() => setStrategy('split')}
              >
                {strategy === 'split' && (
                  <div className="mt-3">
                    <Stepper value={vehicleCount} onChange={setVehicleCount} min={2} max={10} label={t('vehicles')} />
                  </div>
                )}
              </SelectCard>
            </div>
          </Section>

          <Section
            title={<SectionHeading>{t('cargoHeading')}</SectionHeading>}
            aside={<EyebrowLabel>{t('cargoAside')}</EyebrowLabel>}
          >
            <ChipRow>
              {CARGO.map((c) => (
                <Chip
                  key={c.key}
                  type="button"
                  shape="square"
                  accent="slate"
                  glyph={c.glyph}
                  active={cargo === c.key}
                  onClick={() => setCargo(cargo === c.key ? null : c.key)}
                >
                  {t(`cargo.${c.key}`)}
                </Chip>
              ))}
            </ChipRow>
          </Section>

          <Section
            title={<SectionHeading>{t('valueHeading')}</SectionHeading>}
            aside={<EyebrowLabel>{t('valueAside')}</EyebrowLabel>}
          >
            <Field
              type="number"
              inputMode="numeric"
              min={0}
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
              placeholder={t('valuePlaceholder')}
            />
            {ewayRequired && (
              <LightCard className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon name="verified_user" size={18} className="text-fy-brown shrink-0" />
                    <span className="font-body text-label font-semibold text-fy-ink">{t('ewayTitle')}</span>
                  </span>
                  <StatusPill tone="critical" className="shrink-0">
                    {t('mandatory')}
                  </StatusPill>
                </div>
                <Body size="label">{t('ewayHint')}</Body>
                <Field
                  value={ewayBillNumber}
                  onChange={(e) => setEwayBillNumber(e.target.value)}
                  placeholder={t('ewayPlaceholder')}
                />
              </LightCard>
            )}
          </Section>

          <Section
            title={<SectionHeading>{t('pathHeading')}</SectionHeading>}
            aside={
              flow.region ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-fy-well">
                  <Icon name="local_activity" size={13} className="text-fy-slate" />
                  <EyebrowLabel>{t('pricedFor', { region: flow.region })}</EyebrowLabel>
                </span>
              ) : null
            }
          >
            <AddressField
              label={t('originLabel')}
              placeholder={t('originPlaceholder')}
              value={flow.pickup}
              onChange={flow.setPickup}
              markerColorClass="text-fy-slate"
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
            {flow.stops.map((s, i) => (
              <AddressField
                key={i}
                label={t('stopLabel', { n: i + 1 })}
                placeholder={t('stopPlaceholder')}
                value={s}
                onChange={(v) => flow.setStops(flow.stops.map((old, j) => (j === i ? v! : old)))}
                markerColorClass="text-fy-brown"
              />
            ))}
            {flow.stops.length < MAX_STOPS && (
              <Button
                type="button"
                variant="ghost"
                size="md"
                glyph="add_circle"
                onClick={() => flow.setStops([...flow.stops, { lat: 0, lng: 0, address: '' }])}
              >
                {t('addStop')}
              </Button>
            )}
            <AddressField
              label={t('destinationLabel')}
              placeholder={t('destinationPlaceholder')}
              value={flow.drop}
              onChange={flow.setDrop}
              markerColorClass="text-fy-green"
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

          {/* Hamali cross-sell. Turning this on switches the booking to the
              server's real 'combo' dispatch type — a truck and a loading
              crew on one booking — and the quote below updates with it. */}
          <button
            type="button"
            onClick={() => setAddHamali((v) => !v)}
            aria-pressed={addHamali}
            className={`w-full rounded-card p-4 flex items-center justify-between gap-3 text-left transition-colors ${
              addHamali ? 'bg-fy-lime text-fy-on-lime' : 'bg-fy-lime-tint-2 text-fy-ink'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <IconTile tone="green">
                <Icon name="engineering" size={20} />
              </IconTile>
              <div className="min-w-0">
                <p className="font-body text-body font-semibold">{t('hamaliTitle')}</p>
                <p className="font-body text-label text-fy-green">{t('hamaliHint')}</p>
              </div>
            </div>
            <Icon name={addHamali ? 'check_circle' : 'add_circle'} size={22} className="shrink-0 text-fy-green" />
          </button>
          {addHamali && (
            <Panel className="flex flex-col gap-2">
              <EyebrowLabel>{t('crewSize')}</EyebrowLabel>
              <Stepper value={flow.hamaliCount} onChange={flow.setHamaliCount} min={1} max={20} label={t('handlers')} />
            </Panel>
          )}

          {/* Fare plate — every line comes from POST /api/bookings/quote. */}
          <div className="rounded-sheet bg-fy-slate text-fy-on-slate p-5 shadow-card flex flex-col gap-3">
            <EyebrowLabel tone="on-dark" className="opacity-70">
              {t('fareEyebrow')}
            </EyebrowLabel>
            {flow.fareState === 'ready' && fare ? (
              <>
                <div className="flex flex-col gap-2">
                  <StatRow label={t('baseFreight')} value={`₹${fare.baseFare}`} className="text-fy-on-slate" />
                  <StatRow label={t('distanceFare')} value={`₹${fare.distanceFare}`} className="text-fy-on-slate" />
                  {fare.hamaliFare > 0 && (
                    <StatRow label={t('hamaliPool')} value={`+₹${fare.hamaliFare}`} className="text-fy-on-slate" />
                  )}
                  {fare.surgeMultiplier > 1 && (
                    <StatRow label={t('surge')} value={`×${fare.surgeMultiplier}`} className="text-fy-on-slate" />
                  )}
                </div>
                <Divider className="border-fy-bone/15" />
                <MetricBlock
                  onDark
                  tone="lime"
                  label={t('estimatedTotal')}
                  value={`₹${fare.total}`}
                  note={t('gstNote')}
                />
              </>
            ) : (
              <Body tone="on-dark" size="label" className="opacity-80">
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

          <Button
            type="submit"
            variant="slate"
            glyph="fact_check"
            trailingGlyph="arrow_forward"
            disabled={!flow.readyToQuote || flow.submitting}
            className="w-full"
          >
            {flow.submitting ? t('submitting') : t('submit')}
          </Button>
          <Body size="label" className="text-center">
            {t('guaranteeNote')}
          </Body>
        </form>

      </div>
    </RotaryDial>
  );
}
