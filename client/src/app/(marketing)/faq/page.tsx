'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRightIcon } from '@/components/ui/icons';

// Grounded in actual product behavior — fare rules (base + per-km +
// minimum, per region/category), the cancelMyBooking guard, the
// mandatory-rating gate, and the fact that Phase 2 has no payment-gateway
// integration (no paymentStatus field on Booking at all) rather than an
// invented "secure checkout" claim. Also deliberately does not claim a KYC
// verification gate — kycStatus exists on the User model but nothing in
// the backend actually checks it before a worker can go online.
const faqs = [
  {
    q: 'How is my fare calculated?',
    a: "A base fare plus a per-kilometre rate for the route, with a guaranteed minimum — set per region and vehicle/Hamali category. You see the full breakdown and total before you confirm a booking, and it doesn't change after you do.",
  },
  {
    q: 'How do I pay?',
    a: "FYRO shows you the fixed fare upfront. Payment is settled directly with your driver or Hamali team at the end of the job — there's no surprise afterward, since the amount was fixed from the moment you booked.",
  },
  {
    q: 'Can I cancel a booking?',
    a: 'Yes, any time before it\'s marked completed. There\'s no cancellation fee — go to the booking\'s tracking page and use "Cancel booking."',
  },
  {
    q: 'Where does FYRO operate?',
    a: 'Across Andhra Pradesh, expanding district by district — see the full list on the homepage. If you book outside an active district, you\'ll be told plainly rather than left waiting on a match that will never come.',
  },
  {
    q: 'What keeps a job accountable?',
    a: "A pickup and delivery photo attached to every job, live location while it's in progress, and a rating both sides give right after — mandatory before either can start their next job. See the Trust & Safety page for the full list.",
  },
  {
    q: 'What if no one accepts my booking?',
    a: "You'll see it plainly on the tracking screen — FYRO doesn't fake a match. If nothing nearby is available, widen your pickup point or try again shortly as more workers come online.",
  },
  {
    q: "What's a Mutha?",
    a: 'A Mutha is a registered group of Hamali workers with one leader. For jobs that need multiple hands, a Mutha leader receives the request on behalf of the group and assigns members — including splitting one group across more than one job at once.',
  },
  {
    q: 'What if something goes wrong during a job?',
    a: 'Use "Report an issue" on the booking\'s tracking page — no-shows, damage, payment disputes, or misconduct go straight to our team as a complaint logged against that specific job.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
      >
        <span className="font-heading font-semibold text-text-primary">{q}</span>
        <ChevronRightIcon
          className={`w-4 h-4 flex-shrink-0 text-text-muted transition-transform duration-base ${open ? 'rotate-90' : ''}`}
        />
      </button>
      {open && <p className="pb-5 text-sm text-text-muted leading-relaxed pr-8">{a}</p>}
    </div>
  );
}

export default function FaqPage() {
  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-20 -left-32 w-[24rem] h-[24rem] rounded-full bg-secondary/10 blur-[110px] -z-10" />

      <div className="max-w-3xl mx-auto px-6 pt-24 pb-24">
        <div className="mb-12">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-secondary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-4">Frequently asked questions</h1>
          <p className="text-text-muted text-lg leading-relaxed">
            Can&apos;t find what you need?{' '}
            <Link href="/contact" className="text-primary-600 font-semibold hover:underline">
              Contact us
            </Link>
            .
          </p>
        </div>

        <div className="rounded-lg bg-surface-raised border border-border shadow-sm px-6">
          {faqs.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </div>
      </div>
    </div>
  );
}
