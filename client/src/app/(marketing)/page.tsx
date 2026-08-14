'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

const ctas = [
  { href: '/signup/customer', label: 'Book a delivery', tone: 'bg-primary' },
  { href: '/signup/driver', label: 'Drive with us', tone: 'bg-primary' },
  { href: '/signup/hamali', label: 'Join a Mutha', tone: 'bg-secondary' },
];

const steps = [
  { title: 'Tell us what you need', body: 'Cargo weight, pickup and drop points, or how many hands you need for loading.' },
  { title: 'We find the right one', body: 'Nearby drivers and Hamali workers get sequential job offers, just like a ride-hailing captain app.' },
  { title: 'Track it live', body: 'Live map, in-app chat, transparent fare — from pickup to delivery.' },
  { title: 'Pay and rate', body: 'Secure in-app payment, then rate your driver or Hamali team.' },
];

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(circle at 20% 20%, rgba(255,107,43,0.15), transparent 45%), radial-gradient(circle at 80% 60%, rgba(13,148,136,0.15), transparent 45%)',
          }}
        />
        <div className="max-w-4xl mx-auto text-center px-6 pt-24 pb-20">
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="font-heading text-5xl md:text-6xl font-extrabold tracking-tight"
          >
            Find Your <span className="text-primary">Right</span> One.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-6 text-lg text-text-muted max-w-2xl mx-auto"
          >
            Trucks for 1kg or 1000 tons. Hamali labor on demand. Andhra Pradesh&apos;s on-demand
            logistics marketplace — book in minutes, track live.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-10 flex flex-wrap justify-center gap-4"
          >
            {ctas.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className={`${c.tone} text-white px-6 py-3 rounded-full font-medium hover:opacity-90 transition`}
              >
                {c.label}
              </Link>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-20">
        <h2 className="font-heading text-3xl font-bold text-center mb-12">How FYRO works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-surface rounded-2xl p-6"
            >
              <div className="text-primary font-heading text-2xl font-bold mb-3">{i + 1}</div>
              <h3 className="font-semibold mb-2">{s.title}</h3>
              <p className="text-sm text-text-muted">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}
