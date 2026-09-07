'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { Icon } from '@/components/ui/Icon';
import { Media } from '@/components/ui/Media';
import { LightCard, Panel, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button, Chip, ChipRow } from '@/components/fy/Controls';

/* Built against the desktop landing design.

   Section order: sticky header (in the layout) -> dark hero with the live
   settlement plate beside it and a stat strip beneath -> "The tripartite
   cooperative architecture" with three mode tabs over a photo/stat split ->
   "The corner rotary dial" explainer with the dial drawn beside it -> the
   published rate schedule as a ledger table -> three member-charter cards ->
   dark closing CTA with the signup form -> footer stat row (in the layout).

   Largest element: the hero display heading, then the settlement figure.
   Dark surfaces: the hero, the dial panel and the closing CTA.

   Responsive: one column and the phone's own rhythm below `lg`, the
   design's two-column splits above it. Nothing is hidden on small screens —
   the columns stack rather than dropping content.

   Every number on this page comes from GET /api/public/stats, which was
   added for it: aggregate counts and one sum of COMPLETED bookings only, so
   the settlement figure can never run ahead of money that actually moved.
   The design's ₹84,62,19,100, "48,700+ members", "₹127.8 Cr" and "99.4%"
   are not reproduced — a young platform's real numbers are small, and
   printing someone else's would be the one thing on a marketing page that
   is genuinely dishonest rather than merely aspirational. */

const HERO_VIDEO_URL = 'https://res.cloudinary.com/dqwm8wgg8/video/upload/v1787149585/fezidk7rqlmkmcepfuqn.mp4';
const HERO_VIDEO_POSTER =
  'https://res.cloudinary.com/dqwm8wgg8/video/upload/so_0/v1787149585/fezidk7rqlmkmcepfuqn.jpg';

const GUILDS = ['household', 'hamali', 'transport'] as const;
type Guild = (typeof GUILDS)[number];

const GUILD_MEDIA: Record<Guild, string> = {
  household: 'landing.guild.household',
  hamali: 'landing.guild.hamali',
  transport: 'landing.guild.transport',
};

const RATE_ROWS = ['smallVehicle', 'mediumVehicle', 'largeVehicle', 'hamali'] as const;
const CHARTER = ['rotation', 'fixedFare', 'surplus'] as const;
const STEP_KEYS = ['tellUs', 'find', 'track', 'pay'] as const;

interface PublicStats {
  societies: number;
  workers: number;
  completedJobs: number;
  settledValue: number;
  federations: number;
  categories: number;
}

/** The dial, drawn rather than described — three 30° wedges on a corner disc. */
function DialFigure() {
  const wedges = [
    { from: -90, to: -60, fill: 'var(--fy-lime)' },
    { from: -60, to: -30, fill: 'var(--fy-lime-dim)' },
    { from: -30, to: 0, fill: 'var(--fy-brown-soft)' },
  ];
  function arc(from: number, to: number, r: number) {
    const rad = (d: number) => (d * Math.PI) / 180;
    const x1 = 100 + r * Math.cos(rad(from));
    const y1 = 100 + r * Math.sin(rad(from));
    const x2 = 100 + r * Math.cos(rad(to));
    const y2 = 100 + r * Math.sin(rad(to));
    return `M100,100 L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} Z`;
  }
  return (
    <svg viewBox="0 0 200 200" className="w-full max-w-xs mx-auto" role="img" aria-hidden>
      <circle cx="100" cy="100" r="92" fill="var(--fy-brown)" />
      <circle cx="100" cy="100" r="74" fill="none" stroke="var(--fy-bone)" strokeOpacity="0.12" strokeWidth="1" />
      {wedges.map((w, i) => (
        <path key={i} d={arc(w.from, w.to, 74)} fill={w.fill} opacity={i === 0 ? 1 : 0.55} />
      ))}
      <circle cx="100" cy="100" r="34" fill="var(--fy-brown)" />
      <circle cx="100" cy="100" r="34" fill="none" stroke="var(--fy-bone)" strokeOpacity="0.18" strokeWidth="1" />
      {/* The fixed indicator notch sits on the 45° diagonal. */}
      <circle cx={100 + 84 * Math.cos((-45 * Math.PI) / 180)} cy={100 + 84 * Math.sin((-45 * Math.PI) / 180)} r="5" fill="var(--fy-lime)" />
    </svg>
  );
}

export default function HomePage() {
  const reduceMotion = useReducedMotion();
  const t = useTranslations('marketing.home');
  const tp = useTranslations('marketing.pricing');
  const [guild, setGuild] = useState<Guild>('household');

  const statsState = useApiState(
    () => api.get<{ stats: PublicStats }>('/api/public/stats').then((r) => r.stats),
    []
  );
  const stats = statsState.data;

  const settled = useMemo(() => {
    if (!stats) return null;
    return stats.settledValue.toLocaleString('en-IN');
  }, [stats]);

  return (
    <div className="bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain opacity-40 z-0" />

      <div className="relative z-10">
        {/* ---------------------------------------------------------------- hero */}
        <section className="max-w-6xl mx-auto px-gutter pt-6 pb-10">
          <div className="rounded-sheet bg-fy-brown text-fy-bone overflow-hidden shadow-float">
            <div className="grid lg:grid-cols-[1.25fr_1fr] gap-8 p-6 sm:p-10 lg:p-14">
              <div className="flex flex-col justify-center gap-5 min-w-0">
                <span className="self-start rounded-tag bg-fy-brown-soft px-2.5 py-1 font-body text-eyebrow uppercase tracking-[0.12em] text-fy-lime">
                  {t('heroEyebrow')}
                </span>
                <h1 className="font-heading text-display lg:text-[3.5rem] lg:leading-[1.02] text-fy-bone">
                  {t('heroTitleLine1')}{' '}
                  <em className="not-italic text-fy-lime">{t('heroTitleAccent')}</em>
                </h1>
                <Body tone="on-dark" size="body-lg" className="max-w-lg opacity-90">
                  {t('heroSubtitle')}
                </Body>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Link href="/signup/customer">
                    <Button variant="lime">{t('ctaBookDelivery')}</Button>
                  </Link>
                  <Link href="/login">
                    <Button variant="light" className="bg-fy-bone/10 text-fy-bone hover:bg-fy-bone/20">
                      {t('ctaPassbook')}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Live settlement plate — a real sum of completed bookings. */}
              <div className="min-w-0">
                <Panel className="p-5 flex flex-col gap-3 h-full justify-center">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-fy-green animate-pulse" />
                      <EyebrowLabel tone="green">{t('liveSettlement')}</EyebrowLabel>
                    </span>
                    <StatusPill tone="lime">{t('directEscrow')}</StatusPill>
                  </div>
                  <p className="font-heading text-metric lg:text-[2.75rem] text-fy-brown leading-none tabular-nums">
                    {settled != null ? `₹${settled}` : '—'}
                  </p>
                  <Body size="label">{t('settledNote')}</Body>
                  <Divider />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-heading text-title text-fy-ink">{stats?.completedJobs ?? '—'}</p>
                      <EyebrowLabel>{t('jobsSettled')}</EyebrowLabel>
                    </div>
                    <div>
                      <p className="font-heading text-title text-fy-ink">{stats?.societies ?? '—'}</p>
                      <EyebrowLabel>{t('societiesLabel')}</EyebrowLabel>
                    </div>
                  </div>
                </Panel>
              </div>
            </div>

            {/* Stat strip along the hero's base. */}
            <div className="border-t border-fy-bone/15 grid grid-cols-2 lg:grid-cols-4">
              {[
                { value: stats?.categories, label: t('statCargoRangeLabel') },
                { value: stats?.workers, label: t('statWorkersLabel') },
                { value: stats?.federations, label: t('statFederationsLabel') },
                { value: t('statOfferTimeValue'), label: t('statOfferTimeLabel') },
              ].map((s, i) => (
                <div key={i} className="px-6 py-5 border-fy-bone/15 [&:not(:nth-child(-n+2))]:border-t lg:[&:not(:first-child)]:border-l lg:[&]:border-t-0">
                  <p className="font-heading text-title text-fy-lime">{s.value ?? '—'}</p>
                  <EyebrowLabel tone="on-dark" className="opacity-70">
                    {s.label}
                  </EyebrowLabel>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------- tripartite architecture */}
        <section className="max-w-6xl mx-auto px-gutter py-10">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
            <div className="max-w-xl">
              <EyebrowLabel tone="brown">{t('guildsEyebrow')}</EyebrowLabel>
              <h2 className="font-heading text-heading lg:text-display text-fy-ink leading-tight">
                {t('architectureHeading')}
              </h2>
              <Body className="mt-2">{t('architectureBlurb')}</Body>
            </div>
            <ChipRow className="shrink-0">
              {GUILDS.map((g) => (
                <Chip key={g} type="button" shape="round" active={guild === g} onClick={() => setGuild(g)}>
                  {t(`guilds.${g}.title`)}
                </Chip>
              ))}
            </ChipRow>
          </div>

          <div className="grid lg:grid-cols-2 gap-6 items-stretch">
            <div className="relative rounded-sheet overflow-hidden min-h-[280px] lg:min-h-[380px]">
              <Media
                id={GUILD_MEDIA[guild]}
                kind="photo"
                fill
                treatment="full-bleed"
                tint={guild === 'household' ? 'household' : guild === 'hamali' ? 'labour' : 'transport'}
                alt=""
                className="w-full h-full"
              />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-fy-brown via-fy-brown/45 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <EyebrowLabel tone="lime">{t(`guilds.${guild}.tag`)}</EyebrowLabel>
                <SectionHeading as="h3" tone="on-dark">
                  {t(`guilds.${guild}.title`)}
                </SectionHeading>
              </div>
            </div>

            <LightCard className="p-6 flex flex-col justify-between gap-5">
              <Body size="body-lg">{t(`guilds.${guild}.body`)}</Body>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="font-heading text-heading text-fy-brown leading-none">{stats?.categories ?? '—'}</p>
                  <EyebrowLabel>{t('statCargoRangeLabel')}</EyebrowLabel>
                </div>
                <div>
                  <p className="font-heading text-heading text-fy-brown leading-none">{stats?.societies ?? '—'}</p>
                  <EyebrowLabel>{t('societiesLabel')}</EyebrowLabel>
                </div>
                <div>
                  <p className="font-heading text-heading text-fy-brown leading-none">{stats?.workers ?? '—'}</p>
                  <EyebrowLabel>{t('statWorkersLabel')}</EyebrowLabel>
                </div>
                <div>
                  <p className="font-heading text-heading text-fy-brown leading-none">{stats?.federations ?? '—'}</p>
                  <EyebrowLabel>{t('statFederationsLabel')}</EyebrowLabel>
                </div>
              </div>
              <Link href="/signup/customer" className="self-start">
                <Button trailingGlyph="arrow_forward">{t('ctaBookDelivery')}</Button>
              </Link>
            </LightCard>
          </div>
        </section>

        {/* ------------------------------------------------------------ the dial */}
        <section className="max-w-6xl mx-auto px-gutter py-10">
          <div className="rounded-sheet bg-fy-panel p-6 sm:p-10 grid lg:grid-cols-2 gap-8 items-center">
            <div className="min-w-0">
              <EyebrowLabel tone="brown">{t('dialEyebrow')}</EyebrowLabel>
              <h2 className="font-heading text-heading lg:text-display text-fy-ink leading-tight">
                {t('dialHeading')}
              </h2>
              <Body className="mt-2 max-w-md">{t('dialBlurb')}</Body>
              <div className="mt-5 flex flex-col gap-3">
                {GUILDS.map((g, i) => (
                  <div key={g} className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className={`w-3 h-3 rounded-full shrink-0 ${
                        i === 0 ? 'bg-fy-lime' : i === 1 ? 'bg-fy-lime-dim' : 'bg-fy-brown-soft'
                      }`}
                    />
                    <div className="min-w-0">
                      <p className="font-body text-label font-semibold text-fy-ink">{t(`guilds.${g}.title`)}</p>
                      <Body size="label">{t(`dialSector.${g}`)}</Body>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <DialFigure />
          </div>
        </section>

        {/* -------------------------------------------------- published schedule */}
        <section className="max-w-6xl mx-auto px-gutter py-10">
          <div className="max-w-xl mb-6">
            <EyebrowLabel tone="brown">{t('ledgerEyebrow')}</EyebrowLabel>
            <h2 className="font-heading text-heading lg:text-display text-fy-ink leading-tight">
              {t('ledgerHeading')}
            </h2>
            <Body className="mt-2">{t('ledgerBlurb')}</Body>
          </div>

          <Panel className="p-0 overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-fy-hairline/60">
                  {(['category', 'baseFare', 'perKm', 'minimum'] as const).map((h) => (
                    <th key={h} scope="col" className="text-left px-5 py-3">
                      <EyebrowLabel>{tp(`tableHeaders.${h}`)}</EyebrowLabel>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {RATE_ROWS.map((r) => (
                  <tr key={r} className="border-b border-fy-hairline/40 last:border-0">
                    <td className="px-5 py-4 font-body text-body font-semibold text-fy-ink">{tp(`rows.${r}.category`)}</td>
                    <td className="px-5 py-4 font-heading text-title text-fy-brown">{tp(`rows.${r}.base`)}</td>
                    <td className="px-5 py-4 font-body text-body text-fy-ink-soft">{tp(`rows.${r}.perKm`)}</td>
                    <td className="px-5 py-4 font-body text-body text-fy-ink-soft">{tp(`rows.${r}.min`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Body size="label" className="mt-3">
            {t('ledgerFootnote')}
          </Body>
        </section>

        {/* ------------------------------------------------------ member charter */}
        <section className="max-w-6xl mx-auto px-gutter py-10">
          <div className="max-w-2xl mx-auto text-center mb-8">
            <EyebrowLabel tone="brown">{t('charterEyebrow')}</EyebrowLabel>
            <h2 className="font-heading text-heading lg:text-display text-fy-ink leading-tight">
              {t('charterHeadline')}
            </h2>
            <Body className="mt-2">{t('charterBlurb')}</Body>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {CHARTER.map((c) => (
              <LightCard key={c} className="p-6 flex flex-col gap-3">
                <IconTile tone="brown">
                  <Icon name={c === 'rotation' ? 'sync_alt' : c === 'fixedFare' ? 'lock' : 'savings'} size={20} />
                </IconTile>
                <SectionHeading as="h3">{t(`charterCards.${c}.title`)}</SectionHeading>
                <Body>{t(`charterCards.${c}.body`)}</Body>
              </LightCard>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------------- how it works */}
        <section className="max-w-6xl mx-auto px-gutter py-10">
          <div className="max-w-xl mb-6">
            <EyebrowLabel tone="brown">{t('stepsEyebrow')}</EyebrowLabel>
            <h2 className="font-heading text-heading lg:text-display text-fy-ink leading-tight">
              {t('howItWorksHeading')}
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEP_KEYS.map((key, i) => (
              <LightCard key={key} className="p-5 flex flex-col gap-2">
                <span className="w-10 h-10 rounded-card bg-fy-brown text-fy-on-brown flex items-center justify-center font-heading text-title">
                  {i + 1}
                </span>
                <p className="font-body text-body font-semibold text-fy-ink">{t(`steps.${key}Title`)}</p>
                <Body size="label">{t(`steps.${key}Body`)}</Body>
              </LightCard>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- closing CTA */}
        <section className="max-w-6xl mx-auto px-gutter py-10 pb-16">
          <div className="rounded-sheet bg-fy-brown text-fy-bone p-6 sm:p-10 lg:p-14 grid lg:grid-cols-2 gap-8 items-center shadow-float">
            <div className="min-w-0">
              <h2 className="font-heading text-heading lg:text-display leading-tight">
                {t('closingHeading')} <em className="not-italic text-fy-lime">{t('closingAccent')}</em>
              </h2>
              <Body tone="on-dark" size="body-lg" className="mt-3 max-w-md opacity-90">
                {t('closingSubtitle')}
              </Body>
              <div className="flex flex-wrap gap-3 mt-5">
                <Link href="/signup/driver">
                  <Button variant="light">{t('closingDriveCta')}</Button>
                </Link>
                <Link href="/signup/hamali">
                  <Button variant="lime">{t('closingHamaliCta')}</Button>
                </Link>
              </div>
            </div>

            <Panel className="p-6 flex flex-col gap-3">
              <EyebrowLabel tone="brown">{t('joinEyebrow')}</EyebrowLabel>
              <SectionHeading as="h3">{t('joinHeading')}</SectionHeading>
              <Body size="label">{t('joinBlurb')}</Body>
              <Link href="/signup/customer" className="block mt-1">
                <Button trailingGlyph="arrow_forward" className="w-full">
                  {t('requestCharter')}
                </Button>
              </Link>
              <Link href="/how-it-works" className="block">
                <Button variant="light" className="w-full">
                  {t('heroSecondaryCta')}
                </Button>
              </Link>
            </Panel>
          </div>
        </section>

        {/* The hero video stays available as the page's motion element on
            large screens; it is the platform's own footage, and it is
            suppressed entirely under prefers-reduced-motion. */}
        {!reduceMotion && (
          <div className="hidden lg:block max-w-6xl mx-auto px-gutter pb-16">
            <div className="rounded-sheet overflow-hidden h-64">
              <video
                aria-hidden
                autoPlay
                muted
                loop
                playsInline
                poster={HERO_VIDEO_POSTER}
                className="w-full h-full object-cover"
              >
                <source src={HERO_VIDEO_URL} type="video/mp4" />
              </video>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
