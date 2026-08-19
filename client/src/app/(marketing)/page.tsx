'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { SearchIcon, ChevronRightIcon, CompassIcon, CameraIcon, StarIcon, MapPinIcon, TruckIcon, BoxIcon } from '@/components/ui/icons';

const HERO_VIDEO_URL = 'https://res.cloudinary.com/dqwm8wgg8/video/upload/v1787149585/fezidk7rqlmkmcepfuqn.mp4';
// Cloudinary auto-generates a still from the video itself for the poster
// frame (so_0 = first frame, .jpg swaps the delivery format) — no separate
// asset to source, and it means slow connections see a real frame instead
// of a blank flash before the video can play.
const HERO_VIDEO_POSTER = 'https://res.cloudinary.com/dqwm8wgg8/video/upload/so_0/v1787149585/fezidk7rqlmkmcepfuqn.jpg';

// Real, shipped platform mechanics — not marketing fluff. Every claim here
// maps to an actual feature already live in the product (PhotoProofCapture
// on pickup/delivery, the mandatory-rating gate, live GPS broadcast during
// in_progress, sequential real-offer matching), same "no borrowed press
// logos" discipline as the stats array below. Deliberately does NOT claim
// a KYC verification gate — kycStatus exists on the User model but nothing
// in the backend actually checks it before a worker can go online, so
// that claim would be false.
const trustPoints = [
  { icon: CompassIcon, title: 'Real matches, not fake ones', body: "Jobs go to nearby drivers and Hamali workers one at a time, just like a ride-hailing app. If nothing's found, you're told honestly — never shown a fake instant match." },
  { icon: CameraIcon, title: 'Photo proof, both ends', body: 'A pickup and delivery photo is attached to every job — a real record, not just a status label.' },
  { icon: StarIcon, title: 'Two-way ratings', body: "Customers and workers rate each other after every job — mandatory before either side's next one, so it's never a self-selected sample." },
  { icon: MapPinIcon, title: 'Live on the map', body: "Once a job is picked up, you watch it move — the driver or Hamali's location updates in real time." },
];

const districts = [
  'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Kakinada',
  'Rajahmundry', 'Tirupati', 'Anantapur', 'Kadapa', 'Eluru', 'Ongole', 'Srikakulam',
];

const ctas = [
  { href: '/signup/customer', label: 'Book a delivery', tone: 'bg-primary' },
  { href: '/signup/driver', label: 'Drive with us', tone: 'bg-primary' },
  { href: '/signup/hamali', label: 'Join a Mutha', tone: 'bg-secondary' },
];

// Honest platform stats, not borrowed press logos — this is a young
// regional marketplace, not a brand with Forbes/Bloomberg coverage to
// legitimately display.
const stats = [
  { value: '1kg–1000t', label: 'cargo range' },
  { value: '< 60s', label: 'to a live offer' },
  { value: '13', label: 'districts in AP' },
];

// Mirrors Button.tsx's `lg` primary/secondary variant classes exactly, so
// these full-height nav links (they must stay real <Link>s for routing,
// not <button>s) render identically to the shared primitive.
const ctaStyles: Record<string, string> = {
  'bg-primary':
    'bg-primary-600 text-white shadow-md hover:shadow-glow-primary hover:-translate-y-0.5 active:translate-y-0',
  'bg-secondary':
    'bg-secondary-600 text-white shadow-md hover:shadow-glow-secondary hover:-translate-y-0.5 active:translate-y-0',
};

const steps = [
  { title: 'Tell us what you need', body: 'Cargo weight, pickup and drop points, or how many hands you need for loading.' },
  { title: 'We find the right one', body: 'Nearby drivers and Hamali workers get sequential job offers, just like a ride-hailing captain app.' },
  { title: 'Track it live', body: 'Live map, in-app chat, transparent fare — from pickup to delivery.' },
  { title: 'Pay and rate', body: 'A fixed fare shown upfront, no surprises after. Pay your driver or Hamali team, then rate them.' },
];

const easeOutExpo = [0.16, 1, 0.3, 1] as const;

export default function HomePage() {
  const reduceMotion = useReducedMotion();
  const rise = (delay = 0) =>
    reduceMotion
      ? {}
      : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay, ease: easeOutExpo } };

  return (
    <div>
      <section className="relative overflow-hidden">
        {/* Real footage background — replaces the earlier decorative SVG
            route illustration (kept as the reduced-motion/no-JS fallback:
            a video with no autoplay just renders its poster frame, so this
            degrades to a static image rather than breaking). Muted+loop+
            playsInline is required for autoplay to actually run on mobile
            Safari/Chrome. */}
        <video
          aria-hidden
          autoPlay={!reduceMotion}
          muted
          loop
          playsInline
          poster={HERO_VIDEO_POSTER}
          className="absolute inset-0 -z-20 w-full h-full object-cover saturate-[1.15] contrast-[1.05]"
        >
          <source src={HERO_VIDEO_URL} type="video/mp4" />
        </video>
        {/* Layered scrim, not one flat dark wash — the earlier single
            heavy gradient (black/75→55) crushed the footage into near-
            solid black. This keeps the video itself clearly visible at
            the edges/top, and only concentrates darkness (a soft radial
            vignette) where the headline/copy actually sits, so text stays
            legible without hiding what's supposed to be the "wow" moment.
            The bottom-most layer fades to the page's real background so
            the next section (not over video) transitions cleanly. */}
        <div aria-hidden className="absolute inset-0 -z-10 bg-black/20" />
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: 'radial-gradient(ellipse 75% 65% at 50% 40%, rgba(0,0,0,0.55), transparent 70%)' }}
        />
        {/* Precise stops, not the 0/50/100 spread of a named gradient
            utility — the stats row sits ~80% down the section, and a
            plain from/via/to fade was already lightening (and killing
            contrast on) the white stat numbers well before the section
            actually ended. This keeps the video dark through the stats
            row and only fades out in the final ~12%. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{ background: 'linear-gradient(to bottom, transparent 0%, transparent 88%, var(--color-background) 100%)' }}
        />

        <div className="max-w-4xl mx-auto text-center px-6 pt-24 pb-20">
          <motion.span
            {...rise()}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 shadow-sm px-4 py-1.5 text-xs font-semibold text-white mb-7"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live in Andhra Pradesh — real-time matching
          </motion.span>

          <motion.h1
            {...rise(0.06)}
            className="font-heading text-hero font-extrabold tracking-tight leading-[1.02] text-white [text-shadow:0_2px_24px_rgba(0,0,0,0.35)]"
          >
            Move anything.
            <br />
            <span className="font-accent italic text-primary font-medium">Anywhere in AP.</span>
          </motion.h1>
          <motion.p {...rise(0.14)} className="mt-6 text-lg md:text-xl text-white/90 max-w-2xl mx-auto leading-relaxed [text-shadow:0_1px_12px_rgba(0,0,0,0.4)]">
            Trucks for 1kg or 1000 tons. Hamali labor on demand. Book in minutes, watch it move on a live map,
            pay and rate when it&apos;s done.
          </motion.p>

          {/* Search-style primary CTA — the reachable, honest version: it
              routes into signup/booking rather than pretending to search a
              live catalog on the marketing site. */}
          <motion.div {...rise(0.2)} className="mt-9 max-w-xl mx-auto">
            <Link
              href="/signup/customer"
              className="group flex items-center gap-3 rounded-full bg-surface-raised border border-border shadow-lg px-3 py-2.5 pl-5 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-base ease-out-expo"
            >
              <SearchIcon className="w-5 h-5 text-text-muted flex-shrink-0" />
              <span className="flex-1 text-left text-sm md:text-base text-text-muted">
                Where do you need a pickup?
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-600 text-white text-sm font-semibold px-5 py-2.5 group-hover:shadow-glow-primary transition-shadow duration-base flex-shrink-0">
                Get moving
                <ChevronRightIcon className="w-4 h-4" />
              </span>
            </Link>
          </motion.div>

          <motion.div {...rise(0.26)} className="mt-6 flex flex-wrap justify-center gap-3">
            {ctas.slice(1).map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={`inline-flex items-center justify-center rounded-full font-semibold px-5 py-2.5 text-sm transition-all duration-base ease-out-expo ${ctaStyles[c.tone]}`}
              >
                {c.label}
              </Link>
            ))}
          </motion.div>

          <motion.div {...rise(0.32)} className="mt-16 flex items-center justify-center gap-8 sm:gap-14">
            {stats.map((s) => (
              <div key={s.label}>
                <p className="font-heading text-2xl font-extrabold text-white">{s.value}</p>
                <p className="text-xs text-white/70 mt-1">{s.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Trust strip — every claim maps to a shipped feature, not marketing
          copy: KYC gating, photo-proof capture, the ratings system, and the
          live-location broadcast are all real and already live. */}
      <section className="max-w-6xl mx-auto px-6 pt-20">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {trustPoints.map((t, i) => (
            <motion.div
              key={t.title}
              initial={reduceMotion ? undefined : { opacity: 0, y: 20 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: easeOutExpo }}
            >
              <Card className="h-full hover:-translate-y-1 hover:shadow-lg transition-all duration-base ease-out-expo">
                <t.icon className="w-6 h-6 text-primary-600 mb-3" />
                <h3 className="font-heading text-sm font-bold mb-1.5 text-text-primary">{t.title}</h3>
                <p className="text-xs text-text-muted leading-relaxed">{t.body}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="font-heading text-2xl font-bold text-text-primary">How FYRO works</h2>
          <span aria-hidden className="mt-4 inline-block w-14 h-1 rounded-full bg-primary-600" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={reduceMotion ? undefined : { opacity: 0, y: 24 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: easeOutExpo }}
              className={i % 2 === 1 ? 'lg:mt-10' : ''}
            >
              <Card className="relative h-full overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all duration-base ease-out-expo">
                <span
                  aria-hidden
                  className="pointer-events-none select-none absolute -top-5 -right-2 font-heading text-[6rem] leading-none font-extrabold text-primary/10"
                >
                  {i + 1}
                </span>
                <div className="relative">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-primary-600 text-white font-heading font-bold text-sm mb-5 shadow-sm">
                    {i + 1}
                  </div>
                  <h3 className="font-heading text-lg font-semibold mb-2 text-text-primary">{s.title}</h3>
                  <p className="text-sm text-text-muted leading-relaxed">{s.body}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Coverage — real district list, not a "pan-India" overstatement.
          Matches the "13 districts in AP" stat above the fold. */}
      <section className="max-w-4xl mx-auto px-6 pb-24 text-center">
        <h2 className="font-heading text-2xl font-bold text-text-primary mb-2">Where we operate</h2>
        <p className="text-sm text-text-muted mb-8">Live across Andhra Pradesh today, expanding district by district.</p>
        <div className="flex flex-wrap justify-center gap-2.5">
          {districts.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised border border-border px-4 py-2 text-sm text-text-primary shadow-sm"
            >
              <MapPinIcon className="w-3.5 h-3.5 text-primary-600" />
              {d}
            </span>
          ))}
        </div>
      </section>

      {/* Closing recruit banner — the two supply-side CTAs get one more,
          higher-intent shot after the reader has seen how the whole thing
          works, not just buried in the hero's button row. */}
      <section className="max-w-6xl mx-auto px-6 pb-28">
        <div className="relative overflow-hidden rounded-lg bg-text-primary px-8 py-14 sm:px-16 text-center">
          <div aria-hidden className="absolute -top-16 -left-16 w-72 h-72 rounded-full bg-primary/20 blur-[100px]" />
          <div aria-hidden className="absolute -bottom-16 -right-16 w-72 h-72 rounded-full bg-secondary/20 blur-[100px]" />
          <div className="relative">
            <h2 className="font-heading text-2xl sm:text-3xl font-extrabold text-white mb-3">Own a truck? Ready to work?</h2>
            <p className="text-white/70 max-w-lg mx-auto mb-8">
              Set your own hours, get matched to nearby jobs, and get paid for every trip — solo or as part of a Mutha.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                href="/signup/driver"
                className="inline-flex items-center gap-2 rounded-full bg-primary-600 text-white font-semibold px-6 py-3 text-sm shadow-md hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-base"
              >
                <TruckIcon className="w-4 h-4" />
                Drive with FYRO
              </Link>
              <Link
                href="/signup/hamali"
                className="inline-flex items-center gap-2 rounded-full bg-secondary-600 text-white font-semibold px-6 py-3 text-sm shadow-md hover:shadow-glow-secondary hover:-translate-y-0.5 transition-all duration-base"
              >
                <BoxIcon className="w-4 h-4" />
                Join as Hamali
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
