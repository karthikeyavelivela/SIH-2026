'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';

const ctas = [
  { href: '/signup/customer', label: 'Book a delivery', tone: 'bg-primary' },
  { href: '/signup/driver', label: 'Drive with us', tone: 'bg-primary' },
  { href: '/signup/hamali', label: 'Join a Mutha', tone: 'bg-secondary' },
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

        <div className="max-w-4xl mx-auto text-center px-6 pt-28 pb-24">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: easeOutExpo }}
            className="font-heading text-hero font-extrabold tracking-tight leading-[1.02] text-text-primary"
          >
            Find Your <span className="text-primary-600">Right</span> One.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: easeOutExpo }}
            className="mt-6 text-lg md:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed"
          >
            Trucks for 1kg or 1000 tons. Hamali labor on demand. Andhra Pradesh&apos;s on-demand
            logistics marketplace — book in minutes, track live.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2, ease: easeOutExpo }}
            className="mt-11 flex flex-wrap justify-center gap-4"
          >
            {ctas.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={`inline-flex items-center justify-center rounded-full font-semibold px-7 py-3.5 text-base min-h-[52px] transition-all duration-base ease-out-expo ${ctaStyles[c.tone]}`}
              >
                {c.label}
              </Link>
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
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
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
