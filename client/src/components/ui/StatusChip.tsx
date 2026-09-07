import { HTMLAttributes } from 'react';

type Tone = 'primary' | 'secondary' | 'muted' | 'success' | 'danger' | 'warning';

// Same anatomy as fy/Status's StatusPill, kept as its own component because
// the not-yet-rebuilt screens import it by this name. Low-saturation
// container, high-saturation on-container text, all from the design tokens.
const toneClasses: Record<Tone, string> = {
  primary: 'bg-fy-peach text-fy-brown',
  secondary: 'bg-fy-lime-tint-2 text-fy-green',
  muted: 'bg-fy-well text-fy-ink-soft',
  success: 'bg-fy-lime text-fy-on-lime',
  danger: 'bg-fy-error-bg text-fy-on-error-bg',
  warning: 'bg-fy-peach text-fy-brown',
};

interface StatusChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  dot?: boolean;
}

export function StatusChip({ children, tone = 'muted', dot = false, className = '', ...props }: StatusChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-body text-eyebrow uppercase ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}
