'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { FYRO_LOGO_URL } from '@/lib/brand';

/**
 * The first-run shell, shared by language selection, role selection, OTP
 * verification and the walkthrough.
 *
 * These four screens are the first thing anyone sees, and they were each
 * carrying their own arrangement of blurred colour blobs. This is the one
 * arrangement, in the same register as the login and signup screens: bone
 * ground with the grain wash, the mark and an optional back link at the top,
 * a serif charter head, and a sticky action tray so the primary control is
 * always reachable on a small phone without scrolling.
 */

export function OnboardingShell({
  backHref,
  backLabel,
  step,
  eyebrow,
  title,
  accent,
  lede,
  children,
  action,
}: {
  backHref?: string;
  backLabel?: string;
  /** e.g. "01 / 03" — shown opposite the mark when the flow has steps. */
  step?: string;
  eyebrow?: string;
  title: string;
  accent?: string;
  lede?: string;
  children: ReactNode;
  /** Pinned to the bottom of the viewport above the safe area. */
  action?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-fy-bone relative flex flex-col">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain opacity-40 z-0" />

      <header className="relative z-10 max-w-lg w-full mx-auto px-gutter pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2.5 min-w-0">
            {backHref ? (
              <Link
                href={backHref}
                aria-label={backLabel}
                className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full hover:bg-fy-panel transition-colors shrink-0"
              >
                <span aria-hidden className="material-symbols-outlined text-[20px] text-fy-ink">
                  arrow_back
                </span>
              </Link>
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FYRO_LOGO_URL} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
            <span className="font-heading text-title text-fy-brown leading-none">FYRO</span>
          </span>
          {step && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted shrink-0">{step}</span>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-lg w-full mx-auto px-gutter pt-10 pb-40 flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          {eyebrow && (
            <span className="flex items-center gap-2.5">
              <span aria-hidden className="w-7 h-[2px] bg-fy-green" />
              <span className="font-mono text-[11px] tracking-[0.22em] uppercase text-fy-brown font-semibold">
                {eyebrow}
              </span>
            </span>
          )}
          <h1 className="font-heading font-normal text-[2rem] sm:text-4xl leading-[1.05] tracking-[-0.03em] text-fy-ink uppercase">
            {title}
            {accent && (
              <>
                {' '}
                <span className="italic font-light text-fy-green lowercase normal-case">{accent}</span>
              </>
            )}
          </h1>
          {lede && <p className="font-body text-body text-fy-ink-soft leading-relaxed">{lede}</p>}
        </div>

        {children}
      </main>

      {action && (
        <div className="fixed inset-x-0 bottom-0 z-20 bg-fy-bone/92 backdrop-blur-xl border-t border-fy-brown/12">
          <div className="max-w-lg mx-auto px-gutter py-4">{action}</div>
        </div>
      )}
    </div>
  );
}

/**
 * The big tappable option row these screens are built from — a language, a
 * role, a walkthrough choice. Same anatomy throughout: glyph or script, a
 * title and one line of explanation, and a check on the right.
 */
export function OptionRow({
  selected = false,
  glyph,
  lead,
  title,
  body,
  onClick,
  href,
}: {
  selected?: boolean;
  glyph?: string;
  /** Shown instead of a glyph — used for a language's own script. */
  lead?: ReactNode;
  title: string;
  body?: string;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className="flex items-center gap-3.5 min-w-0">
        {lead ? (
          <span
            className={`w-11 h-11 rounded-cell flex items-center justify-center shrink-0 font-heading text-title ${
              selected ? 'bg-fy-green text-fy-on-green' : 'bg-fy-well text-fy-ink-soft'
            }`}
          >
            {lead}
          </span>
        ) : glyph ? (
          <span
            aria-hidden
            className={`w-11 h-11 rounded-cell flex items-center justify-center shrink-0 ${
              selected ? 'bg-fy-green text-fy-on-green' : 'bg-fy-well text-fy-ink-soft'
            }`}
          >
            <span className="material-symbols-outlined text-[22px] leading-none">{glyph}</span>
          </span>
        ) : null}
        <span className="flex flex-col min-w-0 text-left">
          <span className="font-body text-body font-semibold text-fy-ink">{title}</span>
          {body && <span className="font-body text-label text-fy-ink-soft leading-snug">{body}</span>}
        </span>
      </span>
      <span
        aria-hidden
        className={`material-symbols-outlined text-[22px] leading-none shrink-0 ${
          selected ? 'text-fy-green' : 'text-fy-hairline'
        }`}
      >
        {onClick ? (selected ? 'check_circle' : 'radio_button_unchecked') : 'chevron_right'}
      </span>
    </>
  );

  const cls = `w-full flex items-center justify-between gap-3 rounded-card border px-4 py-3.5 transition-colors ${
    selected ? 'border-fy-green bg-fy-lime-tint-1' : 'border-fy-brown/15 bg-fy-card hover:border-fy-brown/40'
  }`;

  if (href) {
    return (
      <Link href={href} className={`${cls} shadow-card`}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" aria-pressed={selected} onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
