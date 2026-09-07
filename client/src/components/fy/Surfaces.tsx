import { ReactNode } from 'react';

/* Surfaces — anatomy per DESIGN_TOKENS.md §4.
   Taken from: household_home (guild tiles, AC-repair dark tile),
   society_governance (white record panels), worker_dashboard_online
   (earnings panel, AI dark card), live_tracking_1 (security dark card). */

type Accent = 'brown' | 'slate';

interface CardProps {
  children: ReactNode;
  className?: string;
}

/**
 * Dark card. Brown by default; slate in transit contexts (goods_transport).
 * The designs never give these a border or a real shadow — separation comes
 * from the colour step alone.
 */
export function DarkCard({
  children,
  accent = 'brown',
  className = '',
}: CardProps & { accent?: Accent }) {
  const bg = accent === 'brown' ? 'bg-fy-brown-soft' : 'bg-fy-slate-soft';
  return <div className={`${bg} rounded-card p-4 ${className}`}>{children}</div>;
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
