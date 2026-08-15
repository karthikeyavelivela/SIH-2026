'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { SearchIcon, ChevronRightIcon } from '@/components/ui/icons';

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
  { title: 'Pay and rate', body: 'Secure in-app payment, then rate your driver or Hamali team.' },
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
        {/* Signature "wow" texture: a faint 8pt grid fading toward the edges,
            behind two large blurred color blobs — gives the hero real depth
            instead of a flat gradient wash. */}
        <div
          aria-hidden
          className="absolute inset-0 -z-20 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 65% 55% at 50% 0%, black 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 65% 55% at 50% 0%, black 40%, transparent 100%)',
          }}
        />
        <div aria-hidden className="absolute -top-24 -left-24 w-[26rem] h-[26rem] rounded-full bg-primary/25 blur-[110px] -z-10" />
        <div aria-hidden className="absolute top-10 -right-24 w-[24rem] h-[24rem] rounded-full bg-secondary/20 blur-[110px] -z-10" />

        {/* Full-bleed decorative route illustration — a winding delivery
            route with pickup/drop pins, standing in for photography we
            don't have real licensed footage/stock for. Andhra Pradesh
            coastline-ish curve, brand colors only. */}
        <svg
          aria-hidden
          viewBox="0 0 1200 420"
          preserveAspectRatio="none"
          className="absolute inset-x-0 top-0 -z-10 w-full h-[420px] opacity-[0.16]"
        >
          <path
            d="M-40 340 C 180 260, 260 380, 460 300 S 780 140, 900 220 S 1150 120, 1260 60"
            fill="none"
            stroke="#BF5020"
            strokeWidth="3"
            strokeDasharray="2 14"
            strokeLinecap="round"
          />
          <circle cx="-40" cy="340" r="7" fill="#BF5020" />
          <circle cx="1260" cy="60" r="7" fill="#0A6F66" />
        </svg>

        <div className="max-w-4xl mx-auto text-center px-6 pt-24 pb-20">
          <motion.span
            {...rise()}
            className="inline-flex items-center gap-2 rounded-full bg-surface-raised border border-border shadow-sm px-4 py-1.5 text-xs font-semibold text-text-muted mb-7"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live in Andhra Pradesh — real-time matching
          </motion.span>

          <motion.h1
            {...rise(0.06)}
            className="font-heading text-hero font-extrabold tracking-tight leading-[1.02] text-text-primary"
          >
            Move anything.
            <br />
            <span className="font-accent italic text-primary-600 font-medium">Anywhere in AP.</span>
          </motion.h1>
          <motion.p {...rise(0.14)} className="mt-6 text-lg md:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
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
                <p className="font-heading text-2xl font-extrabold text-text-primary">{s.value}</p>
                <p className="text-xs text-text-muted mt-1">{s.label}</p>
              </div>
            ))}
          </motion.div>
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
    </div>
  );
}
