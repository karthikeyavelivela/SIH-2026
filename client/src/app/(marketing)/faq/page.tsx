'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRightIcon } from '@/components/ui/icons';

// Grounded in actual product behavior — fare rules (base + per-km +
// minimum, per region/category), the cancelMyBooking guard, the
// mandatory-rating gate, and the fact that Phase 2 has no payment-gateway
// integration (no paymentStatus field on Booking at all) rather than an
// invented "secure checkout" claim. Also deliberately does not claim a KYC
// verification gate — kycStatus exists on the User model but nothing in
// the backend actually checks it before a worker can go online.
const FAQ_KEYS = ['fare', 'payment', 'cancel', 'coverage', 'accountability', 'noAccept', 'mutha', 'issue'] as const;

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
  const t = useTranslations('marketing.faq');
  const faqs = FAQ_KEYS.map((key) => ({
    q: t(`items.${key}.q`),
    a: t(`items.${key}.a`),
  }));

  return (
    <div className="relative overflow-hidden">
      <div aria-hidden className="absolute -top-20 -left-32 w-[24rem] h-[24rem] rounded-full bg-secondary/10 blur-[110px] -z-10" />

      <div className="max-w-3xl mx-auto px-6 pt-24 pb-24">
        <div className="mb-12">
          <span aria-hidden className="inline-block w-12 h-1.5 rounded-full bg-secondary-600 mb-6" />
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text-primary mb-4">{t('title')}</h1>
          <p className="text-text-muted text-lg leading-relaxed">
            {t('cantFindPrefix')}{' '}
            <Link href="/contact" className="text-primary-600 font-semibold hover:underline">
              {t('contactUsLink')}
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
