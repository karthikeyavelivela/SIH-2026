import { ReactNode } from 'react';

/* Text — measured in DESIGN_TOKENS.md §2.
   Serif carries every heading and every number; sans carries everything else.
   Taken from: login (display heading + body), society_governance (section
   heading), worker_dashboard_online (display heading), hamali_labour_standard
   (eyebrow labels above every section). */

type Tone = 'ink' | 'brown' | 'green' | 'muted' | 'on-dark' | 'lime';

const toneClass: Record<Tone, string> = {
  ink: 'text-fy-ink',
  brown: 'text-fy-brown',
  green: 'text-fy-green',
  muted: 'text-fy-muted',
  'on-dark': 'text-fy-bone',
  lime: 'text-fy-lime',
};

/**
 * The tiny uppercase tracked label that sits above almost every section and
 * inside almost every card. 11px / 600 / +0.08em, never ink-black.
 */
export function EyebrowLabel({
  children,
  tone = 'muted',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span className={`font-body text-eyebrow uppercase ${toneClass[tone]} ${className}`}>
      {children}
    </span>
  );
}

/**
 * The biggest thing on a screen — serif, tight, often two lines. The design
 * export ships two hero sizes and uses both: 44px (`display-hero-mobile`,
 * login) and 32px (`headline-lg-mobile`, the landing hero, where the heading
 * shares a 480px card with a badge, body and two buttons).
 */
export function DisplayHeading({
  children,
  tone = 'brown',
  size = 'display',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone;
  size?: 'display' | 'heading';
  className?: string;
}) {
  return (
    <h1
      className={`font-heading ${size === 'display' ? 'text-display' : 'text-heading'} ${toneClass[tone]} ${className}`}
    >
      {children}
    </h1>
  );
}

/** Serif section heading — "Cooperative Guilds", "Board of Trustees". */
export function SectionHeading({
  children,
  tone = 'ink',
  className = '',
  as: Tag = 'h2',
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  return <Tag className={`font-heading text-title ${toneClass[tone]} ${className}`}>{children}</Tag>;
}

// Full static class strings — Tailwind's JIT only emits classes it can find
// literally in source, so a template-built `text-${size}` would silently
// produce no CSS at all.
const sizeClass = {
  body: 'text-body',
  'body-lg': 'text-body-lg',
  label: 'text-label',
} as const;

export function Body({
  children,
  tone = 'ink-soft',
  size = 'body',
  className = '',
}: {
  children: ReactNode;
  tone?: Tone | 'ink-soft';
  size?: keyof typeof sizeClass;
  className?: string;
}) {
  const t = tone === 'ink-soft' ? 'text-fy-ink-soft' : toneClass[tone as Tone];
  return <p className={`font-body ${sizeClass[size]} ${t} ${className}`}>{children}</p>;
}

export function MutedText({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`font-body text-label text-fy-muted ${className}`}>{children}</span>;
}
