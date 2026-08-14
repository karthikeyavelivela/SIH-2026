import { HTMLAttributes } from 'react';

type Tone = 'primary' | 'secondary' | 'muted';

const toneClasses: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  muted: 'bg-text-muted/10 text-text-muted',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ children, tone = 'muted', className = '', ...props }: BadgeProps) {
  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${toneClasses[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
