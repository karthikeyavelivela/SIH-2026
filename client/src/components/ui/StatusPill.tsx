import { HTMLAttributes } from 'react';

// Consolidates StatusChip + Badge + the ad-hoc status spans admin pages
// wrote inline — PAGE_INVENTORY.md's Shared Component Inventory flagged
// three overlapping status primitives; this is the one that should win
// going forward. Semantic `tone`, not a raw color — a booking status, a
// KYC status, and an availability status all pick a tone, never a hex.
type Tone = 'household' | 'labour' | 'transport' | 'neutral' | 'success' | 'danger' | 'warning';

const toneClasses: Record<Tone, string> = {
  household: 'bg-accent-household/10 text-accent-household border border-accent-household/25',
  labour: 'bg-accent-labour/20 text-fyro-ink border border-accent-labour/40',
  transport: 'bg-accent-transport/12 text-accent-transport border border-accent-transport/25',
  neutral: 'bg-ip-surface-container-high text-ip-on-surface-variant border border-ip-outline/15',
  success: 'bg-emerald-500/12 text-emerald-800 border border-emerald-500/25',
  danger: 'bg-ip-error-container text-ip-on-error-container border border-ip-error/25',
  warning: 'bg-amber-500/12 text-amber-800 border border-amber-500/25',
};

interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function StatusPill({ children, tone = 'neutral', dot = false, className = '', ...props }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-chip text-xs font-semibold tracking-wide font-body ${toneClasses[tone]} ${className}`}
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
