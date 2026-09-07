import { HTMLAttributes } from 'react';

type Tone = 'primary' | 'secondary' | 'muted' | 'success' | 'danger' | 'warning';

// Per the Stitch "Ink on Warm Paper" system: low-saturation *container*
// background, high-saturation *on-container* text — distinct from Badge's
// tint-on-light approach. Used on new industrial-style screens (fleet,
// warehouse hub, admin ops) where Badge's softer look reads too consumer-y.
const toneClasses: Record<Tone, string> = {
  primary: 'bg-fy-brown-soft/20 text-fy-brown',
  secondary: 'bg-fy-lime/30 text-fy-green',
  muted: 'bg-fy-well text-fy-ink-soft',
  success: 'bg-emerald-500/15 text-emerald-800',
  danger: 'bg-fy-error-bg text-fy-on-error-bg',
  warning: 'bg-amber-500/15 text-amber-800',
};

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function StatusChip({ children, tone = 'muted', dot = false, className = '', ...props }: StatusChipProps) {
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
