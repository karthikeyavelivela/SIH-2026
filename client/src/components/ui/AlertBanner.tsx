import { ReactNode } from 'react';

type Tone = 'info' | 'warning' | 'danger' | 'success';

const toneClasses: Record<Tone, string> = {
  info: 'bg-ip-secondary-container/40 text-ip-on-secondary-container',
  warning: 'bg-amber-500/15 text-amber-900',
  danger: 'bg-ip-error text-ip-on-error',
  success: 'bg-emerald-500/15 text-emerald-900',
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
    <div className={`flex items-start gap-3 rounded-ip-card px-ip-md py-ip-sm ${toneClasses[tone]} ${className}`} role="alert">
      {icon && <span className="flex-shrink-0 mt-0.5" aria-hidden="true">{icon}</span>}
      <div className="flex-1 text-sm">{children}</div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
