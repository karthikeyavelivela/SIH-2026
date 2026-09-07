import { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  /** e.g. "+12.4%" — sign determines color (never a bare number, always signed). */
  delta?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  icon?: ReactNode;
  className?: string;
}

// KPI tile for admin/fleet/ops dashboards — revenue, active trips, fleet
// utilisation, deployment rate. Big Syne number per DESIGN.md ("Numbers as
// Anchors... at least 16px of clear space"), tonal card, no shadow.
export function MetricCard({ label, value, delta, deltaTone = 'neutral', icon, className = '' }: MetricCardProps) {
  const deltaColor =
    deltaTone === 'positive' ? 'text-fy-green' : deltaTone === 'negative' ? 'text-fy-error' : 'text-fy-muted';
  return (
    <div className={`fy-surface-card flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-label font-semibold uppercase tracking-wide text-fy-ink-soft">{label}</p>
        {icon && <span className="text-fy-muted" aria-hidden="true">{icon}</span>}
      </div>
      <p className="font-heading font-bold text-heading text-fy-ink tabular-nums">{value}</p>
      {delta && <p className={`text-sm font-semibold ${deltaColor}`}>{delta}</p>}
    </div>
  );
}
