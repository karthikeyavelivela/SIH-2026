'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { EditorialPage, PageHead, Chapter } from '@/components/marketing/Editorial';

// Grounded in actual product behavior — fare rules (base + per-km +
// minimum, per region/category), the cancelMyBooking guard, the
// mandatory-rating gate, and the fact that Phase 2 has no payment-gateway
// integration (no paymentStatus field on Booking at all) rather than an
// invented "secure checkout" claim. Also deliberately does not claim a KYC
// verification gate — kycStatus exists on the User model but nothing in
// the backend actually checks it before a worker can go online.
const FAQ_KEYS = ['fare', 'payment', 'cancel', 'coverage', 'accountability', 'noAccept', 'mutha', 'issue'] as const;

function FaqItem({ index, q, a }: { index: string; q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-fy-brown/12 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-start justify-between gap-4 py-5 text-left group"
      >
        <span className="flex items-start gap-4 min-w-0">
          <span className="font-mono text-[10px] text-fy-brown font-bold pt-1.5 shrink-0">{index}</span>
          <span className="font-heading text-title text-fy-ink leading-snug group-hover:text-fy-brown transition-colors">
            {q}
          </span>
        </span>
        <span
          aria-hidden
          className={`material-symbols-outlined text-[20px] text-fy-muted shrink-0 transition-transform duration-base ${
            open ? 'rotate-45' : ''
          }`}
        >
          add
        </span>
      </button>
      {open && (
        <p className="pb-6 pl-[2.1rem] pr-8 font-body text-body text-fy-ink-soft leading-relaxed">{a}</p>
      )}
    </div>
  );
}

export default function FaqPage() {
  const t = useTranslations('marketing.faq');
  const th = useTranslations('marketing.home');

  return (
    <EditorialPage>
      <PageHead
        eyebrow={th('registerLabel')}
        title={t('title')}
        aside={
          <p className="font-body text-body text-fy-ink-soft">
            {t('cantFindPrefix')}{' '}
            <Link href="/contact" className="text-fy-brown font-semibold hover:underline underline-offset-2">
              {t('contactUsLink')}
            </Link>
            .
          </p>
        }
      />

      <Chapter num="01" label={t('title')} right={th('registerTableRight')}>
        <div className="bg-fy-card border border-fy-brown/15 rounded-card shadow-card px-6">
          {FAQ_KEYS.map((key, i) => (
            <FaqItem
              key={key}
              index={String(i + 1).padStart(2, '0')}
              q={t(`items.${key}.q`)}
              a={t(`items.${key}.a`)}
            />
          ))}
        </div>
      </Chapter>
    </EditorialPage>
  );
}
