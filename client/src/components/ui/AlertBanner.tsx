import { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger' | 'success';

const toneClasses: Record<Tone, string> = {
  info: 'bg-fy-lime/40 text-fy-on-lime',
  warning: 'bg-fy-peach text-fy-brown',
  danger: 'bg-fy-error text-fy-on-error',
  success: 'bg-fy-lime/35 text-fy-green',
};

interface AlertBannerProps {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

// Full-width banner — demurrage/grace-period warnings, critical ops
// incidents, emergency SOS state. `danger` uses a solid fill (not a tint)
// on purpose — the one tone in the system meant to read as urgent.
export function AlertBanner({ tone = 'info', icon, children, action, className = '' }: AlertBannerProps) {
  return (
    <div className={`flex items-start gap-3 rounded-card px-6 py-4 ${toneClasses[tone]} ${className}`} role="alert">
      {icon && <span className="flex-shrink-0 mt-0.5" aria-hidden="true">{icon}</span>}
      <div className="flex-1 text-sm">{children}</div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
