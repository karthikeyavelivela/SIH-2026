import { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

/* Status — anatomy per DESIGN_TOKENS.md §4.
   Taken from: login ("SECURE GATE"), household_home ("MOST BOOKED",
   "Tier 1"), hamali_labour_standard ("ACTIVE", "RECOMMENDED"),
   admin_overview ("4 SLA BREACHES", "3 Priority"), society_governance
   ("STATUTORY LEDGER V3.4", "SEALED 2021"). */

type PillTone = 'lime' | 'neutral' | 'critical' | 'brown' | 'slate' | 'outline';

const pillTone: Record<PillTone, string> = {
  // measured: lime fill carries dark-green text, never white
  lime: 'bg-fy-lime text-fy-green',
  neutral: 'bg-fy-well text-fy-ink-soft',
  critical: 'bg-fy-error-bg text-fy-on-error-bg',
  brown: 'bg-fy-brown text-fy-on-brown',
  slate: 'bg-fy-slate text-fy-on-slate',
  outline: 'bg-transparent text-fy-muted border border-fy-hairline',
};

/**
 * The status pill. ~24px tall, fully rounded, 11px uppercase tracked text.
 * `dot` prepends the 6px status dot seen on "ACTIVE DISPATCH" and
 * "Chartered Active".
 */
export function StatusPill({
  children,
  tone = 'neutral',
  dot = false,
  className = '',
}: {
  children: ReactNode;
  tone?: PillTone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-body text-eyebrow uppercase whitespace-nowrap ${pillTone[tone]} ${className}`}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />}
      {children}
    </span>
  );
}

/** The small green check that sits on portraits and next to verified names. */
export function VerifiedBadge({ className = '', size = 18 }: { className?: string; size?: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-fy-green text-fy-on-green ${className}`}
      style={{ width: size, height: size }}
      aria-label="Verified"
    >
      <Icon name="check" size={Math.round(size * 0.7)} />
    </span>
  );
}

/** Grade/tier chip — "Tier 1", "Audit Grade AAA", "Class 4 · Heavy Bulk". */
export function TierBadge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full bg-fy-well font-body text-eyebrow uppercase text-fy-ink-soft ${className}`}
    >
      {children}
    </span>
  );
}
