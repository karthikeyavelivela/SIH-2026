import { HTMLAttributes } from 'react';

type Tone = 'primary' | 'secondary' | 'muted' | 'success' | 'danger' | 'warning';

// Per the Stitch "Ink on Warm Paper" system: low-saturation *container*
// background, high-saturation *on-container* text — distinct from Badge's
// tint-on-light approach. Used on new industrial-style screens (fleet,
// warehouse hub, admin ops) where Badge's softer look reads too consumer-y.
const toneClasses: Record<Tone, string> = {
  primary: 'bg-ip-primary-container/20 text-ip-primary',
  secondary: 'bg-ip-secondary-container/30 text-ip-secondary',
  muted: 'bg-ip-surface-container-high text-ip-on-surface-variant',
  success: 'bg-emerald-500/15 text-emerald-800',
  danger: 'bg-ip-error-container text-ip-on-error-container',
  warning: 'bg-amber-500/15 text-amber-800',
};

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function StatusChip({ children, tone = 'muted', dot = false, className = '', ...props }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-ip-pill text-xs font-semibold tracking-wide font-body ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
