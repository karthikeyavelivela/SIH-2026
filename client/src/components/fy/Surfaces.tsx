import { ReactNode } from 'react';

/* Surfaces — anatomy per DESIGN_TOKENS.md §4.
   Taken from: household_home (guild tiles, AC-repair dark tile),
   society_governance (white record panels), worker_dashboard_online
   (earnings panel, AI dark card), live_tracking_1 (security dark card). */

type Accent = 'brown' | 'slate' | 'green';

interface CardProps {
  children: ReactNode;
  className?: string;
}

// `deep` is the full-strength accent (landing's passbook plate is bg-primary,
// its closing CTA bg-secondary); the default is the one step softer tone the
// in-app dark tiles use.
const darkBg: Record<Accent, { soft: string; deep: string }> = {
  brown: { soft: 'bg-fy-brown-soft', deep: 'bg-fy-brown' },
  slate: { soft: 'bg-fy-slate-soft', deep: 'bg-fy-slate' },
  green: { soft: 'bg-fy-green', deep: 'bg-fy-green' },
};

/**
 * Dark card. Brown by default; slate in transit contexts (goods_transport),
 * green on the landing page's closing call to action.
 * The designs never give these a border or a real shadow — separation comes
 * from the colour step alone.
 */
export function DarkCard({
  children,
  accent = 'brown',
  deep = false,
  className = '',
}: CardProps & { accent?: Accent; deep?: boolean }) {
  const bg = darkBg[accent][deep ? 'deep' : 'soft'];
  return <div className={`${bg} rounded-card p-4 ${className}`}>{children}</div>;
}

// Every tinted icon container in the designs is one of these six. The three
// "fixed" tints (peach / lime / slate-pale) only ever carry ink-dark glyphs;
// the three solid ones only ever carry light glyphs.
const tileTone = {
  brown: 'bg-fy-brown text-fy-on-brown',
  green: 'bg-fy-green text-fy-on-green',
  slate: 'bg-fy-slate text-fy-on-brown',
  peach: 'bg-fy-peach text-fy-brown',
  lime: 'bg-fy-lime text-fy-on-lime',
  'slate-pale': 'bg-fy-slate-pale text-fy-slate',
} as const;

const tileSize = { sm: 'w-9 h-9', md: 'w-10 h-10', lg: 'w-12 h-12' } as const;

/**
 * The rounded square that holds an icon or a step number — the landing
 * page's federation seal (40px brown), its numbered How-It-Works steps
 * (48px, one per mode accent) and its welfare rows (36px pastel tints).
 * Taken from: landing (trust strip, steps, welfare), household_home (guild
 * tile glyphs).
 */
export function IconTile({
  children,
  tone = 'brown',
  size = 'md',
  className = '',
}: {
  children: ReactNode;
  tone?: keyof typeof tileTone;
  size?: keyof typeof tileSize;
  className?: string;
}) {
  return (
    <span
      className={`${tileSize[size]} ${tileTone[tone]} rounded-control flex items-center justify-center shrink-0 ${className}`}
    >
      {children}
    </span>
  );
}

/** Light card — the default content surface (`#F7F3EA`). */
export function LightCard({ children, className = '' }: CardProps) {
  return <div className={`bg-fy-panel rounded-card p-4 ${className}`}>{children}</div>;
}

/** White record/form card — login form, society registration, profile rows. */
export function Panel({ children, className = '' }: CardProps) {
  return <div className={`bg-fy-card rounded-card p-4 shadow-card ${className}`}>{children}</div>;
}

/**
 * A titled block. The designs pair a serif section heading on the left with
 * an uppercase muted micro-label on the right ("Cooperative Guilds" / "FIXED
 * FAIR RATE"), then content beneath.
 */
export function Section({
  title,
  aside,
  children,
  className = '',
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex flex-col gap-3 ${className}`}>
      {(title || aside) && (
        <div className="flex items-baseline justify-between gap-3 px-0.5">
          {typeof title === 'string' ? (
            <h2 className="font-heading text-title text-fy-ink">{title}</h2>
          ) : (
            title
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Hairline rule — the only separator the designs use. Never a vertical one. */
export function Divider({ className = '' }: { className?: string }) {
  return <hr className={`border-0 border-t border-fy-hairline/60 ${className}`} />;
}
