'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Media } from '@/components/ui/Media';
import { LanguageDial } from '@/components/fy/LanguageDial';
import { FYRO_LOGO_URL } from '@/lib/brand';

/**
 * The enrolment shell, shared by every worker and business signup.
 *
 * Built against client/public/design/signup_worker.html and
 * signup_business.html, which are the same screen in two accents: a photo
 * plate carrying the trade, a serif charter head, a white form panel, and
 * the statutory footer. The four role signups previously each carried their
 * own copy of that chrome in slightly different styling; this is the one
 * version, with each page supplying only its own fields.
 *
 * Signed out, the chrome matches the login screen: no nav bar, just the
 * home link and the language dial, each on its own glass ground.
 */

export function SignupShell({
  eyebrow,
  title,
  accent,
  lede,
  mediaId,
  tint,
  stamp,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  lede?: string;
  /** Asset id for the trade plate. */
  mediaId: string;
  tint: 'household' | 'labour' | 'transport';
  /** The corner stamp on the plate — the guild this enrolment joins. */
  stamp: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const tl = useTranslations('marketing.layout');

  return (
    <div className="min-h-screen bg-fy-bone relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain opacity-40 z-0" />

      <div className="fixed top-0 inset-x-0 z-30 pointer-events-none">
        <div className="max-w-2xl mx-auto px-gutter pt-3 flex items-center justify-between gap-3">
          <Link
            href="/"
            aria-label={tl('backToHome')}
            className="pointer-events-auto flex items-center gap-2 min-w-0 h-8 pl-1 pr-3 rounded-full"
            style={{
              background: 'rgba(255,255,255,0.55)',
              backdropFilter: 'blur(12px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
              boxShadow: 'inset 0 0 0 1px rgba(28,28,22,0.10)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FYRO_LOGO_URL} alt="" width={28} height={28} className="w-7 h-7 rounded-full object-cover" />
            <span className="font-heading text-label text-fy-brown leading-none">FYRO</span>
          </Link>
          <LanguageDial size="sm" className="pointer-events-auto" />
        </div>
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-gutter pt-20 pb-16 flex flex-col gap-4">
        {/* Trade plate */}
        <div className="relative rounded-card overflow-hidden shadow-card h-44 bg-fy-dim">
          <Media id={mediaId} kind="photo" fill treatment="full-bleed" tint={tint} alt="" className="w-full h-full" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-fy-ink/80 via-fy-ink/25 to-transparent" />
          <span className="absolute top-4 right-4 border-2 border-fy-lime text-fy-lime px-3 py-1 font-mono text-[10px] tracking-widest uppercase rotate-6 bg-fy-ink/40 backdrop-blur-sm font-bold">
            {stamp}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 pt-1">
          <span className="flex items-center gap-2.5">
            <span aria-hidden className="w-7 h-[2px] bg-fy-green" />
            <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-fy-brown font-semibold">
              {eyebrow}
            </span>
          </span>
          <h1 className="font-heading font-normal text-[2rem] sm:text-4xl leading-[1.05] tracking-[-0.03em] text-fy-ink uppercase">
            {title}
            {accent && (
              <>
                {' '}
                <span className="italic font-light text-fy-green lowercase normal-case">{accent}</span>
              </>
            )}
          </h1>
          {lede && <p className="font-body text-body text-fy-ink-soft leading-relaxed mt-1">{lede}</p>}
        </div>

        {/* Form panel */}
        <div className="bg-fy-card rounded-card p-5 shadow-card border border-fy-brown/12">{children}</div>

        {footer}
      </main>
    </div>
  );
}

/** The shared field shell — label above, consistent control beneath. */
export function SignupField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted font-semibold">{label}</span>
      {children}
      {hint && <span className="font-body text-eyebrow text-fy-muted">{hint}</span>}
    </label>
  );
}

export const signupInputClass =
  'w-full min-h-[48px] px-4 rounded-cell border border-fy-brown/15 bg-fy-bone font-body text-body text-fy-ink placeholder:text-fy-muted/70 outline-none focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/15 transition-shadow';
