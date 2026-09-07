'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel, DarkCard, Section, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, DisplayHeading, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { MetricBlock, StepRow } from '@/components/fy/Data';
import { Button, ChipRow } from '@/components/fy/Controls';
import { PhotoCard } from '@/components/fy/Media';
import { TabRow } from '@/components/fy/Navigation';

/* Built against design-reference landing (client/public/design/landing.html,
   rendered at 430px).

   Section order there, top to bottom: fixed brand header (in the marketing
   layout) -> 480px hero photo card with a floating registration pill and a
   bottom overlay carrying eyebrow chip / display heading / body / lime CTA +
   glass icon button -> federation trust strip (light card, 40px brown icon
   tile) -> DARK BROWN metric plate (header row + hairline + 2-up metric
   grid) -> three guild cards (176px photo, tinted tag pill, serif title +
   accent glyph, body, chip row) -> numbered How-It-Works steps -> WHITE
   welfare panel with three pastel-tiled rows -> rate estimator (segmented
   tabs + white inset box + brown CTA) -> charter pull-quote card -> DARK
   GREEN closing CTA -> 64px 5-tab bottom bar (in the layout).

   Largest element: the hero display heading. Dark surfaces: hero scrim,
   metric plate, closing CTA. Everything else is light on bone.

   Where the design implies data the backend does not have, this renders the
   real equivalent instead of inventing one — see the comments at each site. */

const HERO_VIDEO_URL = 'https://res.cloudinary.com/dqwm8wgg8/video/upload/v1787149585/fezidk7rqlmkmcepfuqn.mp4';
// Cloudinary auto-generates a still from the video itself for the poster
// frame (so_0 = first frame, .jpg swaps the delivery format) — no separate
// asset to source, and it means slow connections see a real frame instead
// of a blank flash before the video can play.
const HERO_VIDEO_POSTER = 'https://res.cloudinary.com/dqwm8wgg8/video/upload/so_0/v1787149585/fezidk7rqlmkmcepfuqn.jpg';

// SIH26089 Phase C — mirrors seedServiceCategories.ts's real 12 categories.
// `guild` buckets them the same way lib/categoryBuckets.ts buckets the live
// DB copy, so the three guild cards below list real bookable categories
// rather than the design's invented feature chips ("Tool Inspection
// Verified", "Hydration & Rest Enforced" — neither is a shipped mechanic).
// Hardcoded rather than fetched from GET /api/service-categories because
// this is the anonymous marketing homepage and that endpoint needs a session.
const SERVICE_CATEGORIES: { key: string; guild: 'household' | 'hamali' | 'transport' }[] = [
  { key: 'electrician', guild: 'household' },
  { key: 'plumber', guild: 'household' },
  { key: 'carpenter', guild: 'household' },
  { key: 'painter', guild: 'household' },
  { key: 'domestic_helper', guild: 'household' },
  { key: 'caregiver', guild: 'household' },
  { key: 'gardener', guild: 'household' },
  { key: 'cleaner', guild: 'household' },
  { key: 'technician', guild: 'household' },
  { key: 'general_labour', guild: 'hamali' },
  { key: 'driver', guild: 'transport' },
  { key: 'general_logistics', guild: 'transport' },
];

const GUILDS = [
  { key: 'household', glyph: 'carpenter', tag: 'brown', tint: 'household' },
  { key: 'hamali', glyph: 'handyman', tag: 'lime', tint: 'labour' },
  { key: 'transport', glyph: 'local_shipping', tag: 'slate', tint: 'transport' },
] as const;

// The four shipped mechanics the page has always claimed: sequential real
// offers to nearby verified members, PhotoProofCapture on pickup/delivery,
// the mandatory two-way rating gate, and the live GPS broadcast while a job
// is in_progress. The design has no slot for them, but they are real and
// dropping them would quietly weaken the page, so they reuse the same tinted
// row anatomy as the welfare panel.
const TRUST_KEYS = [
  { key: 'realMatches', glyph: 'groups', tone: 'peach' },
  { key: 'photoProof', glyph: 'photo_camera', tone: 'lime' },
  { key: 'ratings', glyph: 'star', tone: 'slate-pale' },
  { key: 'liveMap', glyph: 'location_on', tone: 'peach' },
] as const;

const STEP_KEYS = ['tellUs', 'find', 'track', 'pay'] as const;
const STEP_TONES = ['brown', 'green', 'slate', 'brown'] as const;

// Mirrors seedFederations.ts's real 6-state federation hierarchy.
const STATE_KEYS = ['andhraPradesh', 'telangana', 'karnataka', 'tamilNadu', 'maharashtra', 'kerala'] as const;

// The three welfare mechanisms that actually exist server-side, replacing the
// design's "100% Health Shield / 4.2% NPS auto-route / Child Education
// Fellowship" — none of which the backend implements. These do:
// InsurancePlan+InsurancePolicy+ParametricTrigger, Mutha.welfareDeductionRatePct
// posted as its own 'welfare_fund' LedgerEntry, and SurplusDistribution.
const WELFARE = [
  { key: 'cover', glyph: 'health_and_safety', tone: 'peach' },
  { key: 'fund', glyph: 'savings', tone: 'lime' },
  { key: 'surplus', glyph: 'account_balance', tone: 'slate-pale' },
] as const;

// The published rate card — the same four rows /pricing renders, so the two
// pages can never drift apart. The design's estimator shows a single invented
// "₹380 / metric ton"; there is no per-tonne rate anywhere in the product.
const RATE_KEYS = ['smallVehicle', 'mediumVehicle', 'largeVehicle', 'hamali'] as const;
const RATE_TABS = ['smallVehicle', 'mediumVehicle', 'largeVehicle', 'hamali'] as const;

export default function HomePage() {
  const reduceMotion = useReducedMotion();
  const t = useTranslations('marketing.home');
  const tp = useTranslations('marketing.pricing');
  const [rate, setRate] = useState<(typeof RATE_KEYS)[number]>('hamali');

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain opacity-40 z-0" />

      <div className="relative z-10 max-w-2xl mx-auto px-gutter pt-4 pb-8 flex flex-col gap-8">
        {/* Hero — the design's 480px photo card, carrying the platform's own
            footage instead of a stock still. autoplay is suppressed under
            prefers-reduced-motion, where a <video> with no autoplay renders
            its poster frame, so it degrades to the design's photo exactly. */}
        <PhotoCard
          id="landing.hero"
          alt=""
          height="tall"
          scrim="brown"
          className="rounded-sheet shadow-float"
          media={
            <video
              aria-hidden
              autoPlay={!reduceMotion}
              muted
              loop
              playsInline
              poster={HERO_VIDEO_POSTER}
              className="w-full h-full object-cover object-center"
            >
              <source src={HERO_VIDEO_URL} type="video/mp4" />
            </video>
          }
          topLeft={
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-fy-card/92 backdrop-blur-md shadow-card font-body text-eyebrow uppercase text-fy-ink">
              <span className="w-2 h-2 rounded-full bg-fy-green animate-pulse" aria-hidden />
              {t('heroBadge')}
            </span>
          }
          overlay={
            <div className="flex flex-col gap-3">
              <span className="self-start rounded-tag bg-fy-brown/80 px-2.5 py-1 font-body text-eyebrow uppercase tracking-[0.12em] text-fy-lime">
                {t('heroEyebrow')}
              </span>
              <DisplayHeading size="heading" tone="on-dark">
                {t('heroTitleLine1')} {t('heroTitleAccent')}
              </DisplayHeading>
              <Body tone="on-dark" className="max-w-sm">
                {t('heroSubtitle')}
              </Body>
              <div className="flex items-center gap-3 pt-1">
                <Link href="/signup/customer" className="flex-1">
                  <Button variant="lime" className="w-full">
                    {t('ctaBookDelivery')}
                  </Button>
                </Link>
                <Link
                  href="/how-it-works"
                  aria-label={t('heroSecondaryCta')}
                  className="w-14 h-14 shrink-0 rounded-control bg-fy-card/20 backdrop-blur-md text-fy-bone flex items-center justify-center active:scale-95 transition-transform"
                >
                  <Icon name="play_circle" size={22} />
                </Link>
              </div>
            </div>
          }
        />

        {/* Federation trust strip. The design claims "1,527 registered
            cooperative societies"; the seeded hierarchy is 6 state
            federations and their district societies, so that is what this
            says. */}
        <div className="bg-fy-well rounded-card p-4 flex items-start gap-3">
          <IconTile tone="brown">
            <Icon name="assured_workload" size={22} />
          </IconTile>
          <div className="min-w-0">
            <EyebrowLabel tone="brown">{t('federationEyebrow')}</EyebrowLabel>
            <Body className="mt-0.5">
              {t.rich('federationBody', {
                b: (chunks) => <strong className="font-semibold text-fy-ink">{chunks}</strong>,
              })}
            </Body>
          </div>
        </div>

        {/* Metric plate. The design shows a live dividend and a retained-tariff
            percentage; no anonymous endpoint exposes either figure (there is no
            public stats route at all), so this carries the same honest platform
            facts the page has always shown. */}
        <DarkCard accent="brown" deep className="p-5 rounded-sheet shadow-card">
          <div className="flex items-start justify-between gap-3 pb-4">
            <div className="min-w-0">
              <EyebrowLabel tone="on-dark" className="opacity-70">
                {t('statsEyebrow')}
              </EyebrowLabel>
              <p className="font-body text-body font-semibold text-fy-bone mt-0.5">{t('statsTitle')}</p>
            </div>
            <StatusPill tone="lime" className="shrink-0">
              {t('statOfferTimeValue')} {t('statOfferTimeLabel')}
            </StatusPill>
          </div>
          <div className="border-t border-fy-bone/15 grid grid-cols-2 gap-4 pt-4">
            <MetricBlock
              onDark
              tone="lime"
              label={t('statCargoRangeLabel')}
              value={t('statCargoRangeValue')}
              note={t('statCargoRangeNote')}
            />
            <MetricBlock
              onDark
              tone="on-dark"
              label={t('statDistrictsLabel')}
              value={t('statDistrictsValue')}
              note={t('statDistrictsNote')}
            />
          </div>
        </DarkCard>

        {/* Three guild cards. The chip row under each is that guild's real
            bookable service categories, replacing the design's invented
            feature badges. */}
        <Section
          title={
            <div className="flex flex-col">
              <EyebrowLabel>{t('guildsEyebrow')}</EyebrowLabel>
              <SectionHeading>{t('guildsHeading')}</SectionHeading>
            </div>
          }
        >
          {GUILDS.map((g) => (
            <LightCard key={g.key} className="p-0 overflow-hidden">
              <PhotoCard
                id={`landing.guild.${g.key}`}
                alt=""
                height="card"
                scrim="none"
                tint={g.tint}
                className="rounded-none"
                topLeft={<StatusPill tone={g.tag}>{t(`guilds.${g.key}.tag`)}</StatusPill>}
              />
              <div className="p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <SectionHeading as="h3">{t(`guilds.${g.key}.title`)}</SectionHeading>
                  <Icon
                    name={g.glyph}
                    size={20}
                    className={
                      g.key === 'household'
                        ? 'text-fy-brown shrink-0'
                        : g.key === 'hamali'
                          ? 'text-fy-green shrink-0'
                          : 'text-fy-slate shrink-0'
                    }
                  />
                </div>
                <Body>{t(`guilds.${g.key}.body`)}</Body>
                <ChipRow className="pt-1">
                  {SERVICE_CATEGORIES.filter((c) => c.guild === g.key).map((c) => (
                    <span
                      key={c.key}
                      className="px-2 py-0.5 rounded-tag bg-fy-dim font-body text-eyebrow uppercase text-fy-ink"
                    >
                      {t(`categories.${c.key}`)}
                    </span>
                  ))}
                </ChipRow>
              </div>
            </LightCard>
          ))}
        </Section>

        <Section
          title={
            <div className="flex flex-col">
              <EyebrowLabel>{t('trustEyebrow')}</EyebrowLabel>
              <SectionHeading>{t('trustHeading')}</SectionHeading>
            </div>
          }
        >
          {TRUST_KEYS.map((p) => (
            <div key={p.key} className="p-4 rounded-card bg-fy-well flex items-start gap-3">
              <IconTile tone={p.tone} size="sm">
                <Icon name={p.glyph} size={20} />
              </IconTile>
              <div className="min-w-0">
                <h4 className="font-body text-body font-semibold text-fy-ink">{t(`trust.${p.key}Title`)}</h4>
                <Body className="mt-0.5">{t(`trust.${p.key}Body`)}</Body>
              </div>
            </div>
          ))}
        </Section>

        <Section
          title={
            <div className="flex flex-col">
              <EyebrowLabel>{t('stepsEyebrow')}</EyebrowLabel>
              <SectionHeading>{t('howItWorksHeading')}</SectionHeading>
            </div>
          }
        >
          {STEP_KEYS.map((key, i) => (
            <StepRow key={key} step={i + 1} tone={STEP_TONES[i]} title={t(`steps.${key}Title`)}>
              {t(`steps.${key}Body`)}
            </StepRow>
          ))}
        </Section>

        {/* Worker welfare. Three real mechanisms — see the WELFARE comment. */}
        <Panel className="p-5 rounded-sheet flex flex-col gap-4">
          <span className="flex items-center gap-2 text-fy-brown">
            <Icon name="volunteer_activism" size={24} />
            <EyebrowLabel tone="brown">{t('welfareEyebrow')}</EyebrowLabel>
          </span>
          <SectionHeading as="h3" className="leading-snug">
            {t('welfareHeading')}
          </SectionHeading>
          <div className="flex flex-col gap-3">
            {WELFARE.map((w) => (
              <div key={w.key} className="p-4 rounded-card bg-fy-panel flex items-start gap-3">
                <IconTile tone={w.tone} size="sm">
                  <Icon name={w.glyph} size={20} />
                </IconTile>
                <div className="min-w-0">
                  <h5 className="font-body text-body font-semibold text-fy-ink">{t(`welfare.${w.key}.title`)}</h5>
                  <Body className="mt-0.5">{t(`welfare.${w.key}.body`)}</Body>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* Rate estimator — the real published rate card, not an invented
            per-tonne figure. Same four rows as /pricing. */}
        <LightCard className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <EyebrowLabel>{t('estimatorEyebrow')}</EyebrowLabel>
              <p className="font-body text-body font-semibold text-fy-ink">{t('estimatorTitle')}</p>
            </div>
            <Icon name="calculate" size={22} className="text-fy-muted shrink-0" />
          </div>
          <TabRow
            variant="segment"
            active={rate}
            onChange={(k) => setRate(k as (typeof RATE_KEYS)[number])}
            tabs={RATE_TABS.map((k) => ({ key: k, label: t(`rateTabs.${k}`) }))}
          />
          <div className="p-4 rounded-control bg-fy-card flex items-start justify-between gap-3 shadow-card">
            <div className="shrink-0">
              <EyebrowLabel>{t('estimatorBaseLabel')}</EyebrowLabel>
              <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="font-heading text-metric text-fy-brown">{tp(`rows.${rate}.base`)}</span>
                {/* Hamali is priced per worker, so its rate card row carries an
                    em-dash for per-km. Rendering that verbatim leaves a dangling
                    dash next to the fare. */}
                {tp(`rows.${rate}.perKm`) !== '—' && (
                  <span className="font-body text-body text-fy-muted">+ {tp(`rows.${rate}.perKm`)}</span>
                )}
              </div>
            </div>
            <div className="text-right min-w-0">
              <EyebrowLabel tone="green">{t('estimatorFixed')}</EyebrowLabel>
              <p className="font-body text-label text-fy-ink-soft">
                {t('estimatorMinLabel')} {tp(`rows.${rate}.min`)}
              </p>
            </div>
          </div>
          <Link href="/pricing" className="block">
            <Button className="w-full">{t('estimatorCta')}</Button>
          </Link>
        </LightCard>

        {/* The design puts a named member testimonial here. The product has a
            two-way Rating model but no reviews-of-the-platform content and no
            public endpoint for one, so rather than invent a member and a quote
            this carries the charter the cooperative actually operates under —
            same card anatomy, seal in place of the portrait. */}
        <Section
          title={
            <div className="flex flex-col">
              <EyebrowLabel>{t('charterEyebrow')}</EyebrowLabel>
              <SectionHeading>{t('charterHeading')}</SectionHeading>
            </div>
          }
        >
          <LightCard className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <IconTile tone="brown" size="lg" className="rounded-full">
                <Icon name="workspace_premium" size={24} />
              </IconTile>
              <div className="min-w-0">
                <p className="font-body text-body font-semibold text-fy-ink">{t('charterSource')}</p>
                <EyebrowLabel>{t('charterSourceMeta')}</EyebrowLabel>
              </div>
            </div>
            <Body className="italic">{t('charterQuote')}</Body>
            <Divider />
            <div className="flex items-center justify-between gap-3">
              <EyebrowLabel>{t('charterMetaLeft')}</EyebrowLabel>
              <EyebrowLabel tone="green">{t('charterMetaRight')}</EyebrowLabel>
            </div>
          </LightCard>
        </Section>

        {/* Coverage — the real seeded state list. The design has no equivalent
            section, but dropping it would remove a shipped, honest claim that
            backs the "6 states" metric directly above. */}
        <Section
          title={
            <div className="flex flex-col">
              <EyebrowLabel>{t('coverageEyebrow')}</EyebrowLabel>
              <SectionHeading>{t('whereWeOperateHeading')}</SectionHeading>
            </div>
          }
        >
          <Body className="-mt-1">{t('whereWeOperateSubtitle')}</Body>
          <ChipRow>
            {STATE_KEYS.map((k) => (
              // Plain spans, not Chip — these are labels, and a <button> that
              // does nothing would be a keyboard trap for no reason.
              <span
                key={k}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-fy-card shadow-card font-body text-label text-fy-ink"
              >
                <Icon name="location_on" size={14} className="text-fy-brown" />
                {t(`states.${k}`)}
              </span>
            ))}
          </ChipRow>
        </Section>

        {/* Closing CTA — the design's full-green plate. Both buttons keep the
            supply-side signup routes the page has always recruited through. */}
        <DarkCard accent="green" deep className="p-6 rounded-sheet shadow-float flex flex-col items-center text-center gap-3">
          <Icon name="handshake" size={36} className="text-fy-on-green" />
          <SectionHeading as="h3" tone="on-dark" className="font-semibold">
            {t('closingHeading')}
          </SectionHeading>
          <Body tone="on-dark" className="max-w-xs opacity-90">
            {t('closingSubtitle')}
          </Body>
          <div className="w-full flex flex-col gap-2 pt-2">
            <Link href="/signup/driver" className="block">
              <Button variant="light" className="w-full">
                {t('closingDriveCta')}
              </Button>
            </Link>
            <Link href="/signup/hamali" className="block">
              <Button variant="lime" className="w-full">
                {t('closingHamaliCta')}
              </Button>
            </Link>
          </div>
        </DarkCard>
      </div>
    </div>
  );
}
