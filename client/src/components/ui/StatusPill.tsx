import { HTMLAttributes } from 'react';

// Consolidates StatusChip + Badge + the ad-hoc status spans admin pages
// wrote inline — PAGE_INVENTORY.md's Shared Component Inventory flagged
// three overlapping status primitives; this is the one that should win
// going forward. Semantic `tone`, not a raw color — a booking status, a
// KYC status, and an availability status all pick a tone, never a hex.
type Tone = 'household' | 'labour' | 'transport' | 'neutral' | 'success' | 'danger' | 'warning';

const toneClasses: Record<Tone, string> = {
  household: 'bg-fy-brown/10 text-fy-brown border border-fy-brown/25',
  labour: 'bg-fy-lime/20 text-fy-ink border border-fy-lime/40',
  transport: 'bg-fy-slate/12 text-fy-slate border border-fy-slate/25',
  neutral: 'bg-fy-well text-fy-ink-soft border border-fy-muted/15',
  success: 'bg-fy-green/12 text-fy-green border border-fy-green/25',
  danger: 'bg-fy-error-bg text-fy-on-error-bg border border-fy-error/25',
  warning: 'bg-fy-peach text-fy-brown border border-fy-brown/25',
};

interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function StatusPill({ children, tone = 'neutral', dot = false, className = '', ...props }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wide font-body ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** Maps a booking/job status enum to a StatusPill tone + human label —
 * the fix for PAGE_INVENTORY.md's notification-copy finding
 * ("Your booking is now in_progress" interpolating the raw enum). Callers
 * pass the enum value; this returns what to render, never the enum itself. */
const BOOKING_STATUS_TONE: Record<string, Tone> = {
  requested: 'neutral',
  searching: 'neutral',
  accepted: 'transport',
  in_progress: 'transport',
  completed: 'success',
  cancelled: 'danger',
  disputed: 'warning',
};

export function bookingStatusTone(status: string): Tone {
  return BOOKING_STATUS_TONE[status] ?? 'neutral';
}
