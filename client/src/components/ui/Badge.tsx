import { HTMLAttributes } from 'react';

type Tone = 'primary' | 'secondary' | 'muted' | 'success' | 'danger' | 'warning';

const toneClasses: Record<Tone, string> = {
  primary: 'bg-fy-brown/10 text-fy-brown',
  secondary: 'bg-fy-green/10 text-fy-green',
  muted: 'bg-text-muted/10 text-fy-muted',
  success: 'bg-emerald-500/10 text-emerald-700',
  danger: 'bg-red-500/10 text-red-700',
  // "Expiring soon" per PRODUCT.md — warm amber, not alarming red, since
  // nothing's actually wrong yet.
  warning: 'bg-amber-500/10 text-amber-700',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ children, tone = 'muted', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
