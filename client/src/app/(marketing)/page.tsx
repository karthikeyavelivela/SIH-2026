'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { Media } from '@/components/ui/Media';
import { assetUrl } from '@/lib/MEDIA_MANIFEST';
import { useReveal } from '@/lib/useReveal';

/* Built against the Stitch editorial landing design.

   Section order: video hero -> 01 manifesto -> 02 tripartite divisions ->
   03 rotary vitrine -> 04 open register -> 05 member charter -> closing
   charter call. Header and footer live in the layout.

   The hero video sits at the very top as the page's first element, warm-
   graded and washed so the headline stays legible over it, and it is
   suppressed entirely under prefers-reduced-motion (the poster frame shows
   instead).

   Numbers: every figure comes from GET /api/public/stats — aggregate counts
   and one sum of COMPLETED bookings — or from the published fare rules. The
   design's ₹384 crore, 1,42,850 members, 482 societies and "0.00%
   extraction" are not reproduced: the platform now takes a published 10%
   commission, and its real totals are small. The register table shows the
   rate schedule rather than invented member payouts, because member ledger
   rows are private and naming fake people beside real rupee amounts is the
   one thing on a marketing page that would be plainly dishonest. */

/* The hero's moving backdrop. No video file exists in the repo, the design
   export or the Cloudinary sets supplied so far, so the URL is read from the
   environment and the slot degrades to the real landing photograph (with a
   slow drift) when it is unset — rather than pointing at an invented asset
   that would 404 in production. Set NEXT_PUBLIC_HERO_VIDEO_URL to light it up;
   the poster falls back to the same still either way. */
const HERO_VIDEO_URL = process.env.NEXT_PUBLIC_HERO_VIDEO_URL || '';
const HERO_POSTER = assetUrl('landing.hero') ?? '';

const DIVISIONS = ['artisan', 'hamali', 'freight'] as const;
type Division = (typeof DIVISIONS)[number];

const DIVISION_MEDIA: Record<Division, string> = {
  artisan: 'landing.guild.household',
  hamali: 'landing.guild.hamali',
  freight: 'landing.guild.transport',
};

/* Each division's plate is footage of that trade at work, not a still. The
   poster falls back to the division's photograph so the panel is never
   blank while the file loads or if it fails outright. */
const DIVISION_VIDEO: Record<Division, string> = {
  artisan: 'https://res.cloudinary.com/dqwm8wgg8/video/upload/v1789117298/jzytstxxglawl596hhqj.mp4',
  hamali: 'https://res.cloudinary.com/dqwm8wgg8/video/upload/v1789117421/indpwkqvkow3cmb7ka3l.mp4',
  freight: 'https://res.cloudinary.com/dqwm8wgg8/video/upload/v1789117416/aiuquvbu64oyo0iy9utx.mp4',
};

const DIVISION_TINT: Record<Division, 'household' | 'labour' | 'transport'> = {
  artisan: 'household',
  hamali: 'labour',
  freight: 'transport',
};

/** Which published fare row headlines each division. */
const DIVISION_RATE: Record<Division, string> = {
  artisan: 'hamali',
  hamali: 'hamali',
  freight: 'smallVehicle',
};

const RATE_ROWS = ['smallVehicle', 'mediumVehicle', 'largeVehicle', 'hamali'] as const;
const CHARTER = ['rotation', 'fixedFare', 'surplus'] as const;

interface PublicStats {
  societies: number;
  workers: number;
  completedJobs: number;
  settledValue: number;
  federations: number;
  categories: number;
}

/** Section rule with its numbered monograph label, as the design sets them. */
function SectionRule({ num, label, right }: { num: string; label: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-fy-brown/15 pb-4 mb-12 font-mono text-[11px] uppercase tracking-widest text-fy-muted">
      <span className="text-fy-brown font-bold flex items-center gap-2 min-w-0">
        <span aria-hidden className="w-1.5 h-1.5 bg-fy-green shrink-0" />
        <span className="truncate">
          {num} / {label}
        </span>
      </span>
      {right && <span className="hidden md:inline shrink-0">{right}</span>}
    </div>
  );
}

/** The rotary dial, drawn — three 120° sectors on a machined bezel. */
function RotaryVitrine({ active, onSelect }: { active: Division; onSelect: (d: Division) => void }) {
  const t = useTranslations('marketing.home');
  const angle: Record<Division, number> = { artisan: 0, hamali: 120, freight: 240 };
  const index: Record<Division, string> = { artisan: '01', hamali: '02', freight: '03' };

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="relative w-72 h-72 sm:w-80 sm:h-80 flex items-center justify-center select-none">
        <div className="absolute inset-0 rounded-full border-2 border-fy-brown/25 p-3 bg-fy-panel shadow-card">
          <div className="w-full h-full rounded-full border border-fy-brown/15 bg-fy-card flex items-center justify-center relative">
            <svg className="absolute inset-0 w-full h-full text-fy-brown/35" viewBox="0 0 400 400" aria-hidden>
              <circle cx="200" cy="200" r="182" fill="none" stroke="currentColor" strokeDasharray="2 6" strokeWidth="1.5" />
              <circle cx="200" cy="200" r="168" fill="none" stroke="currentColor" strokeDasharray="1 12" strokeWidth="1" />
            </svg>

            {/* Knob — rotates to the selected sector with a spring. */}
            <div
              className="relative w-44 h-44 sm:w-52 sm:h-52 rounded-full flex items-center justify-center shadow-float transition-transform duration-slow ease-spring"
              style={{
                transform: `rotate(${angle[active]}deg)`,
                background:
                  'conic-gradient(from 0deg, var(--fy-panel) 0deg, var(--fy-dim) 45deg, var(--fy-field) 90deg, var(--fy-edge) 135deg, var(--fy-bone) 180deg, var(--fy-dim) 225deg, var(--fy-edge) 270deg, var(--fy-field) 315deg, var(--fy-panel) 360deg)',
              }}
            >
              <span aria-hidden className="absolute inset-2 rounded-full border-4 border-dashed border-fy-brown/20" />
              <span aria-hidden className="absolute top-2 w-2.5 h-8 bg-fy-brown rounded-full shadow-card" />
              <span
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-fy-card border-2 border-fy-brown/25 shadow-card flex flex-col items-center justify-center text-center p-2"
                style={{ transform: `rotate(${-angle[active]}deg)` }}
              >
                <span className="font-mono text-[9px] uppercase tracking-widest text-fy-muted">{t('dialSector')}</span>
                <span className="font-heading text-heading font-bold text-fy-brown leading-none">{index[active]}</span>
                <span className="font-mono text-[10px] text-fy-green font-bold uppercase tracking-wider">
                  {t(`divisions.${active}.short`)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-[11px]">
        {DIVISIONS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={active === d}
            onClick={() => onSelect(d)}
            className={`px-4 py-2 rounded-cell border shadow-card transition-all font-medium ${
              active === d
                ? 'bg-fy-brown text-fy-bone border-fy-brown'
                : 'bg-fy-card border-fy-brown/25 text-fy-ink hover:border-fy-brown'
            }`}
          >
            {angle[d]}° [{t(`divisions.${d}.short`)}]
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const reduceMotion = useReducedMotion();
  const t = useTranslations('marketing.home');
  const tp = useTranslations('marketing.pricing');
  const [division, setDivision] = useState<Division>('artisan');

  /* The backdrop drift is the only thing on the page that animates forever,
     so it is stopped whenever the hero is off screen — otherwise the
     compositor never idles while a reader is down in the ledger. */
  const heroRef = useRef<HTMLElement | null>(null);
  const [heroVisible, setHeroVisible] = useState(true);
  useEffect(() => {
    const node = heroRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting), { threshold: 0 });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const statsState = useApiState(
    () => api.get<{ stats: PublicStats }>('/api/public/stats').then((r) => r.stats),
    []
  );
  const stats = statsState.data;
  useReveal([statsState.status]);
  const settled = useMemo(() => (stats ? stats.settledValue.toLocaleString('en-IN') : null), [stats]);

  const tickerItems = [
    t('tickerSettled', { amount: settled ?? '—' }),
    t('tickerCommission'),
    t('tickerSocieties', { count: stats?.societies ?? 0, districts: stats?.federations ?? 0 }),
    t('tickerMembers', { count: stats?.workers ?? 0 }),
    t('tickerCategories', { count: stats?.categories ?? 0 }),
  ];

  return (
    <div className="bg-fy-bone text-fy-ink relative overflow-x-hidden">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain opacity-50 z-0" />

      {/* ===================================================== HERO / VIDEO */}
      <section
        ref={heroRef}
        className="relative min-h-[calc(100vh-5rem)] w-full flex flex-col justify-between px-gutter lg:px-12 pt-10 pb-8 overflow-hidden"
      >
        {/* The moving backdrop is the page's first element, behind everything. */}
        <div aria-hidden className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {HERO_VIDEO_URL ? (
            <video
              autoPlay={!reduceMotion}
              muted
              loop
              playsInline
              poster={HERO_POSTER || undefined}
              className="w-full h-full object-cover object-center scale-105 opacity-[0.2] mix-blend-multiply contrast-105 sepia-[0.35] brightness-110"
            >
              <source src={HERO_VIDEO_URL} type="video/mp4" />
            </video>
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={HERO_POSTER}
              alt=""
              className={`w-full h-full object-cover object-center opacity-[0.2] mix-blend-multiply contrast-105 sepia-[0.35] brightness-110 ${
                reduceMotion || !heroVisible ? 'scale-105' : 'fy-hero-drift'
              }`}
            />
          )}
          {/* Warm washes so the headline stays legible over any frame. */}
          <div className="absolute inset-0 bg-gradient-to-b from-fy-bone/90 via-fy-bone/78 to-fy-bone" />
          <div className="absolute inset-0 bg-gradient-to-r from-fy-bone via-transparent to-fy-bone/85" />
        </div>

        {/* Telugu archival watermark */}
        <span
          aria-hidden
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none z-0 whitespace-nowrap opacity-[0.055] text-[16vw] font-heading font-bold text-fy-brown tracking-tight"
        >
          {t('watermark')}
        </span>

        <div className="relative z-10 max-w-7xl mx-auto w-full my-auto py-6">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <span aria-hidden className="w-8 h-[2px] bg-fy-green" />
            <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-fy-brown font-semibold">
              {t('heroEyebrow')}
            </span>
            <span aria-hidden className="text-fy-brown/40">
              •
            </span>
            <span className="font-heading italic text-label text-fy-muted tracking-wide">{t('watermark')}</span>
          </div>

          <h1 className="font-heading font-normal text-[2.35rem] xs:text-[2.6rem] sm:text-6xl lg:text-[6rem] leading-[0.95] tracking-[-0.035em] text-fy-ink uppercase max-w-5xl">
            {t('heroTitleLine1')} <br />
            <span className="italic font-light text-fy-green lowercase">{t('heroTitleAccent')}</span> <br />
            {t('heroTitleLine3')}
          </h1>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-end">
            <div className="lg:col-span-7">
              <p className="font-body text-body-lg text-fy-ink-soft font-light leading-relaxed max-w-xl">
                {t('heroSubtitle')}
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <Link
                  href="/signup/customer"
                  className="group px-7 py-4 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone font-mono text-[11px] font-semibold uppercase tracking-widest flex items-center gap-3 rounded-cell shadow-card transition-all"
                >
                  <span>{t('ctaEngage')}</span>
                  <span aria-hidden className="material-symbols-outlined text-sm text-fy-lime group-hover:translate-x-1 transition-transform">
                    arrow_forward
                  </span>
                </Link>
                <Link
                  href="/pricing"
                  className="px-7 py-4 bg-fy-card/85 hover:bg-fy-card border border-fy-brown/20 text-fy-ink font-mono text-[11px] font-medium uppercase tracking-widest flex items-center gap-2.5 rounded-cell backdrop-blur-sm shadow-card transition-colors"
                >
                  <span aria-hidden className="material-symbols-outlined text-base text-fy-green">
                    verified_user
                  </span>
                  <span>{t('ctaInspect')}</span>
                </Link>
              </div>
            </div>

            {/* Frosted telemetry card — the real settled figure. */}
            <div className="lg:col-span-5">
              <div
                className="p-6 rounded-card shadow-float border border-fy-brown/15"
                style={{
                  background: 'rgba(255,255,255,0.75)',
                  backdropFilter: 'blur(18px) saturate(1.4)',
                  WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
                }}
              >
                <div className="flex items-center justify-between gap-3 border-b border-fy-brown/10 pb-3 mb-4">
                  <span className="flex items-center gap-2 min-w-0">
                    <span aria-hidden className="w-2 h-2 rounded-full bg-fy-green animate-pulse shrink-0" />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted font-medium truncate">
                      {t('liveSettlement')}
                    </span>
                  </span>
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded-tag bg-fy-lime-tint-1 text-fy-green border border-fy-lime/50 uppercase font-semibold shrink-0">
                    {t('commissionChip')}
                  </span>
                </div>

                <span className="font-heading text-[2.2rem] sm:text-[2.6rem] font-normal tracking-tight text-fy-ink block leading-none tabular-nums">
                  {settled != null ? `₹${settled}` : '—'}
                </span>
                <span className="font-mono text-[11px] text-fy-muted block mt-2">{t('settledNote')}</span>

                <div className="w-full bg-fy-dim h-1.5 rounded-full overflow-hidden my-4">
                  <div
                    className="bg-fy-green h-full rounded-full transition-all duration-slow"
                    style={{ width: stats && stats.completedJobs > 0 ? '100%' : '4%' }}
                  />
                </div>

                <div className="flex justify-between font-mono text-[10px] text-fy-muted">
                  <span>{t('jobsSettledLine', { count: stats?.completedJobs ?? 0 })}</span>
                  <span className="text-fy-brown font-semibold">{t('societiesLine', { count: stats?.societies ?? 0 })}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ticker strip */}
        <div className="relative z-10 w-full pt-4 border-t border-fy-brown/15 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-fy-muted tracking-wider">
          <div className="flex items-center gap-6 overflow-hidden w-full min-w-0 sm:flex-1">
            <span className="text-fy-brown font-bold flex items-center gap-1.5 shrink-0">
              <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-fy-green" />
              {t('liveTelemetry')}
            </span>
            {/* A real marquee: the list is rendered twice and the track
                translates by exactly half its width, so the loop is seamless
                with no gap or jump. It pauses on hover so a reader can
                actually read a figure, and holds still under reduced
                motion (where it scrolls by hand instead). */}
            <div
              className={`fy-marquee min-w-0 flex-1 ${reduceMotion ? 'overflow-x-auto scrollbar-none' : ''}`}
              style={{
                maskImage: 'linear-gradient(to right, transparent 0, #000 2rem, #000 calc(100% - 3rem), transparent 100%)',
                WebkitMaskImage:
                  'linear-gradient(to right, transparent 0, #000 2rem, #000 calc(100% - 3rem), transparent 100%)',
              }}
            >
              <div className={reduceMotion ? 'flex items-center gap-8 whitespace-nowrap' : 'fy-marquee-track'}>
                {(reduceMotion ? [tickerItems] : [tickerItems, tickerItems]).map((group, g) => (
                  <div key={g} className="flex items-center gap-8 whitespace-nowrap pr-8" aria-hidden={g === 1}>
                    {group.map((item, i) => (
                      <span key={i} className={i === 1 ? 'text-fy-green font-medium' : ''}>
                        ● {item}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <a href="#manifesto" className="hidden sm:flex items-center gap-2 hover:text-fy-brown transition-colors shrink-0 font-medium">
            <span className="uppercase tracking-widest text-[10px]">{t('scrollDown')}</span>
            <span aria-hidden className="material-symbols-outlined text-sm animate-bounce text-fy-brown">
              arrow_downward
            </span>
          </a>
        </div>
      </section>

      {/* ==================================================== 01 / MANIFESTO */}
      <section id="manifesto" className="fy-reveal relative z-10 py-24 lg:py-28 px-gutter lg:px-12 max-w-7xl mx-auto border-t border-fy-brown/15">
        <SectionRule num="01" label={t('manifestoLabel')} right={t('manifestoRight')} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 items-start">
          <div className="lg:col-span-7 flex flex-col gap-10">
            <h2 className="font-heading text-3xl sm:text-5xl font-light leading-[1.06] tracking-tight text-fy-ink">
              {t('manifestoHeadline')} <span className="italic text-fy-green font-normal">{t('manifestoAccent')}</span>
            </h2>

            <div className="flex flex-col gap-5 text-fy-ink-soft font-body text-body-lg font-light leading-relaxed border-l-2 border-fy-brown/40 pl-7">
              <p>{t('manifestoP1')}</p>
              <p>
                {t.rich('manifestoP2', {
                  b: (c) => <strong className="text-fy-ink font-semibold">{c}</strong>,
                  rate: (c) => (
                    <span className="text-fy-brown font-mono font-semibold bg-fy-well px-1.5 py-0.5 rounded-tag">{c}</span>
                  ),
                })}
              </p>
            </div>

            <div className="p-7 bg-fy-card border border-fy-brown/20 rounded-card shadow-card relative">
              <span aria-hidden className="font-heading text-6xl text-fy-brown/20 absolute -top-3 left-4 select-none">
                “
              </span>
              <p className="font-heading italic text-body-lg text-fy-ink pl-6 leading-relaxed">{t('manifestoQuote')}</p>
              <div className="mt-6 pl-6 pt-4 border-t border-fy-brown/10 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-fy-muted tracking-wider">
                <span className="font-semibold text-fy-brown">{t('manifestoQuoteAttr')}</span>
                <span className="text-fy-green font-bold">{t('manifestoQuoteSeal')}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="p-3 bg-fy-card border border-fy-brown/20 shadow-float rounded-card">
              <div className="relative overflow-hidden aspect-[4/5] rounded-cell bg-fy-dim">
                <Media
                  id="landing.hero"
                  kind="photo"
                  fill
                  treatment="full-bleed"
                  tint="household"
                  alt=""
                  className="w-full h-full"
                />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-fy-ink/30 via-transparent to-transparent" />
                <span className="absolute top-4 right-4 border-2 border-fy-green text-fy-green px-3 py-1 font-mono text-[10px] tracking-widest uppercase rotate-6 bg-fy-card/90 shadow-card font-bold">
                  {t('plateStamp')}
                </span>
              </div>
              <div className="p-3 flex items-center justify-between gap-2 font-mono text-[11px] text-fy-muted">
                <span className="font-medium text-fy-ink truncate">{t('plateCaption')}</span>
                <span className="text-fy-brown font-semibold shrink-0">{t('plateRight')}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 bg-fy-card border border-fy-brown/15 shadow-card rounded-card">
                <span className="font-mono text-[10px] text-fy-muted uppercase block font-medium">
                  {t('statWorkersLabel')}
                </span>
                <span className="font-heading text-heading text-fy-ink font-light mt-1 block">{stats?.workers ?? '—'}</span>
                <span className="font-mono text-[9px] text-fy-brown font-medium">
                  {t('statFederationsInline', { count: stats?.federations ?? 0 })}
                </span>
              </div>
              <div className="p-5 bg-fy-card border border-fy-brown/15 shadow-card rounded-card">
                <span className="font-mono text-[10px] text-fy-muted uppercase block font-medium">
                  {t('statCommissionLabel')}
                </span>
                <span className="font-heading text-heading text-fy-green font-normal mt-1 block">10%</span>
                <span className="font-mono text-[9px] text-fy-muted">{t('statCommissionSub')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================== 02 / TRIPARTITE */}
      <section id="divisions" className="fy-reveal relative z-10 py-24 lg:py-28 px-gutter lg:px-12 max-w-7xl mx-auto border-t border-fy-brown/15">
        <SectionRule num="02" label={t('divisionsLabel')} right={t('divisionsRight')} />

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <h2 className="font-heading text-4xl sm:text-5xl font-light text-fy-ink leading-tight">
            {t('divisionsHeading')} <br />
            <span className="italic text-fy-muted font-light">{t('divisionsSub')}</span>
          </h2>

          <div className="flex bg-fy-well p-1 border border-fy-brown/15 rounded-cell font-mono text-[11px] uppercase tracking-wider shrink-0 overflow-x-auto">
            {DIVISIONS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={division === d}
                onClick={() => setDivision(d)}
                className={`px-4 py-2.5 rounded-cell transition-all whitespace-nowrap ${
                  division === d
                    ? 'bg-fy-card text-fy-brown font-semibold shadow-card border border-fy-brown/20'
                    : 'text-fy-muted hover:text-fy-ink'
                }`}
              >
                0{i + 1}. {t(`divisions.${d}.short`)}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-fy-card border border-fy-brown/15 overflow-hidden shadow-float rounded-card">
          <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[520px]">
            <div className="lg:col-span-5 relative overflow-hidden bg-fy-dim min-h-[320px] lg:min-h-full">
              {reduceMotion ? (
                <Media
                  id={DIVISION_MEDIA[division]}
                  kind="photo"
                  fill
                  treatment="full-bleed"
                  tint={DIVISION_TINT[division]}
                  alt=""
                  className="w-full h-full"
                />
              ) : (
                <video
                  key={division}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  poster={assetUrl(DIVISION_MEDIA[division])}
                  aria-hidden
                  className="absolute inset-0 w-full h-full object-cover"
                >
                  <source src={DIVISION_VIDEO[division]} type="video/mp4" />
                </video>
              )}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-fy-ink/80 via-fy-ink/20 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <span className="font-mono text-[11px] text-fy-lime uppercase tracking-widest block mb-1 font-semibold">
                  {t('guildSector', { n: DIVISIONS.indexOf(division) + 1 })}
                </span>
                <h3 className="font-heading text-2xl sm:text-3xl text-fy-bone font-light">{t(`divisions.${division}.title`)}</h3>
                <p className="font-mono text-[11px] text-fy-bone/80 mt-1 uppercase tracking-wider">
                  {t(`divisions.${division}.sub`)}
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 p-7 lg:p-12 flex flex-col justify-between bg-fy-panel">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-fy-brown/15 pb-4 mb-7">
                  <span className="font-mono text-[11px] text-fy-brown uppercase tracking-widest font-semibold">
                    {t(`divisions.${division}.charter`)}
                  </span>
                  <span className="font-mono text-[11px] px-2.5 py-1 rounded-tag bg-fy-lime-tint-1 text-fy-green border border-fy-lime/50 font-bold">
                    {t('publishedRateChip')}
                  </span>
                </div>

                <p className="font-body text-body-lg text-fy-ink-soft font-light leading-relaxed mb-8">
                  {t(`divisions.${division}.desc`)}
                </p>

                <div className="grid grid-cols-3 gap-5 py-5 border-y border-fy-brown/15 mb-7 font-mono bg-fy-card/60 px-4 rounded-cell">
                  <div>
                    <span className="text-[10px] text-fy-muted uppercase block font-medium">{t('statCategories')}</span>
                    <span className="font-heading text-2xl sm:text-3xl text-fy-ink mt-1 block font-normal">
                      {stats?.categories ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-fy-muted uppercase block font-medium">{t('statFloor')}</span>
                    <span className="font-heading text-2xl sm:text-3xl text-fy-green mt-1 block font-semibold">
                      {tp(`rows.${DIVISION_RATE[division]}.min`)}
                    </span>
                    <span className="text-[9px] text-fy-muted">{t('statFloorSub')}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-fy-muted uppercase block font-medium">{t('statSocieties')}</span>
                    <span className="font-heading text-2xl sm:text-3xl text-fy-ink mt-1 block font-normal">
                      {stats?.societies ?? '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted font-medium block">
                    {t('tradesIncluded')}
                  </span>
                  <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                    {(t.raw(`divisions.${division}.chips`) as string[]).map((chip) => (
                      <span
                        key={chip}
                        className="px-3 py-1 bg-fy-card border border-fy-brown/20 text-fy-ink rounded-cell shadow-card"
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-7 mt-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-fy-brown/15">
                <span className="flex items-center gap-2 font-mono text-[11px] text-fy-muted">
                  <span aria-hidden className="material-symbols-outlined text-sm text-fy-brown">
                    gavel
                  </span>
                  <span>{t('arbitratedBy')}</span>
                </span>
                <Link
                  href="/signup/customer"
                  className="px-7 py-3.5 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone font-mono text-[11px] font-semibold uppercase tracking-widest flex items-center gap-3 rounded-cell shadow-card transition-colors"
                >
                  <span>{t('engageDivision')}</span>
                  <span aria-hidden className="material-symbols-outlined text-sm text-fy-lime">
                    bolt
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================== 03 / ROTARY */}
      <section id="rotary" className="fy-reveal relative z-10 py-24 lg:py-28 px-gutter lg:px-12 bg-fy-panel border-t border-fy-brown/15 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--fy-brown) 1px, transparent 1px), linear-gradient(to bottom, var(--fy-brown) 1px, transparent 1px)',
            backgroundSize: '3.5rem 3.5rem',
          }}
        />
        <div className="max-w-7xl mx-auto relative z-10">
          <SectionRule num="03" label={t('rotaryLabel')} right={t('rotaryRight')} />

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-14 items-center">
            <div className="lg:col-span-5 flex flex-col gap-7">
              <div className="flex flex-col gap-4">
                <span className="inline-flex self-start items-center gap-2 px-3 py-1 bg-fy-card border border-fy-brown/20 text-fy-brown font-mono text-[10px] uppercase tracking-widest font-semibold shadow-card rounded-cell">
                  <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-fy-green" />
                  {t('rotaryChip')}
                </span>
                <h2 className="font-heading text-3xl sm:text-5xl font-light text-fy-ink leading-tight">
                  {t('rotaryHeading')} <br />
                  <span className="italic text-fy-green font-normal">{t('rotaryAccent')}</span>
                </h2>
              </div>

              <p className="font-body text-body text-fy-ink-soft font-light leading-relaxed">{t('rotaryBlurb')}</p>

              <div className="grid grid-cols-2 gap-4 font-mono">
                {(['sectors', 'reach', 'collapse', 'motion'] as const).map((k) => (
                  <div key={k} className="p-4 bg-fy-card border border-fy-brown/15 shadow-card rounded-cell">
                    <span className="text-[10px] text-fy-muted uppercase block font-medium">{t(`rotarySpec.${k}.label`)}</span>
                    <span className="font-heading text-2xl text-fy-ink mt-1 block font-medium">
                      {t(`rotarySpec.${k}.value`)}
                    </span>
                    <span className="text-[9px] text-fy-muted">{t(`rotarySpec.${k}.sub`)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col items-center justify-center p-8 sm:p-12 bg-fy-card border border-fy-brown/15 shadow-float rounded-card">
              <div className="font-mono text-center mb-8">
                <span className="text-[10px] uppercase tracking-widest text-fy-brown font-bold block">
                  {t('rotarySimTitle')}
                </span>
                <span className="text-[11px] text-fy-muted">{t('rotarySimSub')}</span>
              </div>
              <RotaryVitrine active={division} onSelect={setDivision} />
            </div>
          </div>
        </div>
      </section>

      {/* ==================================================== 04 / REGISTER */}
      <section id="register" className="fy-reveal relative z-10 py-24 lg:py-28 px-gutter lg:px-12 max-w-7xl mx-auto border-t border-fy-brown/15">
        <SectionRule num="04" label={t('registerLabel')} right={t('registerRight')} />

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 mb-12">
          <h2 className="font-heading text-4xl sm:text-5xl font-light text-fy-ink leading-tight">
            {t('registerHeading')} <br />
            <span className="italic text-fy-muted font-light">{t('registerSub')}</span>
          </h2>

          <div className="p-5 bg-fy-card border border-fy-brown/25 rounded-card max-w-md font-mono text-[11px] shadow-card">
            <span className="flex items-center gap-2 text-fy-brown font-bold mb-1">
              <span aria-hidden className="material-symbols-outlined text-sm text-fy-green">
                verified
              </span>
              <span>{t('registerGuaranteeTitle')}</span>
            </span>
            <p className="text-fy-ink-soft leading-relaxed">{t('registerGuaranteeBody')}</p>
          </div>
        </div>

        <div className="border border-fy-brown/15 bg-fy-card shadow-float rounded-card overflow-hidden">
          <div className="p-4 sm:px-6 bg-fy-panel border-b border-fy-brown/15 flex flex-wrap items-center justify-between gap-4 font-mono text-[11px]">
            <span className="flex items-center gap-3">
              <span aria-hidden className="w-2 h-2 rounded-full bg-fy-green animate-pulse" />
              <span className="text-fy-ink font-semibold tracking-wider">{t('registerTableTitle')}</span>
            </span>
            <span className="text-fy-muted">{t('registerTableRight')}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead>
                <tr className="border-b border-fy-brown/15">
                  {(['category', 'baseFare', 'perKm', 'minimum'] as const).map((h) => (
                    <th key={h} scope="col" className="text-left px-6 py-3">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted">
                        {tp(`tableHeaders.${h}`)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-fy-brown/10">
                {RATE_ROWS.map((r) => (
                  <tr key={r} className="hover:bg-fy-panel/70 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-body text-body font-medium text-fy-ink block">{tp(`rows.${r}.category`)}</span>
                      <span className="font-mono text-[10px] text-fy-muted uppercase">{t('activeRule')}</span>
                    </td>
                    <td className="px-6 py-4 font-heading text-title text-fy-brown font-semibold">{tp(`rows.${r}.base`)}</td>
                    <td className="px-6 py-4 font-body text-body text-fy-ink-soft">{tp(`rows.${r}.perKm`)}</td>
                    <td className="px-6 py-4 font-body text-body text-fy-ink-soft">{tp(`rows.${r}.min`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-4 sm:px-6 bg-fy-panel/60 border-t border-fy-brown/15 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[11px] text-fy-muted">
            <span className="flex items-center gap-2">
              <span aria-hidden className="material-symbols-outlined text-sm text-fy-brown">
                lock
              </span>
              <span>{t('registerFootnote')}</span>
            </span>
            <Link href="/pricing" className="text-fy-brown hover:underline font-semibold">
              {t('registerLink')}
            </Link>
          </div>
        </div>
      </section>

      {/* ===================================================== 05 / CHARTER */}
      <section id="charter" className="fy-reveal relative z-10 py-24 lg:py-28 px-gutter lg:px-12 bg-fy-card/70 border-t border-fy-brown/15">
        <div className="max-w-7xl mx-auto">
          <SectionRule num="05" label={t('charterLabel')} right={t('charterRight')} />

          <div className="max-w-2xl mb-12">
            <h2 className="font-heading text-4xl sm:text-5xl font-light text-fy-ink leading-tight">
              {t('charterHeadline')} <span className="italic text-fy-green font-normal">{t('charterAccent')}</span>
            </h2>
            <p className="font-body text-body-lg text-fy-ink-soft font-light mt-3">{t('charterBlurb')}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {CHARTER.map((c, i) => (
              <div
                key={c}
                className="relative p-7 bg-fy-card border border-fy-brown/15 flex flex-col justify-between gap-7 hover:border-fy-brown transition-all shadow-card hover:shadow-float rounded-card"
              >
                <div className="flex flex-col gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-fy-brown font-bold">
                    0{i + 1} / {t(`charterCards.${c}.title`)}
                  </span>
                  <p className="font-heading italic text-body-lg text-fy-ink leading-snug">{t(`charterCards.${c}.body`)}</p>
                </div>
                <div className="pt-5 border-t border-fy-brown/10 font-mono text-[10px] text-fy-muted uppercase tracking-wider">
                  {t(`charterCards.${c}.source`)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================= CLOSING CHARTER */}
      <section className="relative z-10 py-20 px-gutter lg:px-12 max-w-7xl mx-auto border-t border-fy-brown/15">
        <div className="p-8 sm:p-12 lg:p-14 bg-fy-card border border-fy-brown/25 rounded-card shadow-float">
          <div className="max-w-3xl flex flex-col gap-6">
            <span className="inline-flex self-start items-center gap-2 font-mono text-[11px] text-fy-brown uppercase tracking-widest font-semibold">
              <span aria-hidden className="w-2 h-2 rounded-full bg-fy-green" />
              {t('closingChip')}
            </span>
            <h3 className="font-heading text-3xl sm:text-5xl font-light text-fy-ink leading-tight">
              {t('closingHeading')} <br />
              <span className="italic text-fy-green font-normal">{t('closingAccent')}</span>
            </h3>
            <p className="font-body text-body-lg text-fy-ink-soft font-light max-w-xl">{t('closingSubtitle')}</p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link
                href="/signup/driver"
                className="px-8 py-4 bg-fy-brown hover:bg-fy-brown-soft text-fy-bone font-mono text-[11px] font-semibold uppercase tracking-widest rounded-cell shadow-card transition-all"
              >
                {t('closingDriveCta')}
              </Link>
              <Link
                href="/signup/customer"
                className="px-8 py-4 bg-fy-card hover:bg-fy-panel border border-fy-brown/25 text-fy-ink font-mono text-[11px] font-semibold uppercase tracking-widest rounded-cell transition-all"
              >
                {t('closingPatronCta')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
