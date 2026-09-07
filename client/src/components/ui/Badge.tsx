import { HTMLAttributes } from 'react';

type Tone = 'primary' | 'secondary' | 'muted' | 'success' | 'danger' | 'warning';

// On the design's palette, not Tailwind's defaults: a tinted container with
// its own on-container text, per DESIGN_TOKENS.md. `warning` is the peach
// tint rather than amber — "expiring soon" is a heads-up, not an alarm.
const toneClasses: Record<Tone, string> = {
  primary: 'bg-fy-peach text-fy-brown',
  secondary: 'bg-fy-lime-tint-2 text-fy-green',
  muted: 'bg-fy-well text-fy-ink-soft',
  success: 'bg-fy-lime text-fy-on-lime',
  danger: 'bg-fy-error-bg text-fy-on-error-bg',
  warning: 'bg-fy-peach text-fy-brown',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ children, tone = 'muted', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-body text-eyebrow uppercase ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
