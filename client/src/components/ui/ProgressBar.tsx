interface ProgressBarProps {
  value: number; // 0-100
  tone?: 'household' | 'labour' | 'transport';
  label?: string;
  className?: string;
}

export function ProgressBar({ value, tone = 'labour', label, className = '' }: ProgressBarProps) {
  const fillClass = { household: 'bg-accent-household', labour: 'bg-accent-labour', transport: 'bg-accent-transport' }[tone];
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={className}>
      {label && (
        <div className="flex justify-between mb-1.5">
          <span className="font-body text-label-ui text-ip-on-surface-variant">{label}</span>
          <span className="font-body text-label-ui tabular-nums text-fyro-ink">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-2 rounded-chip bg-ip-surface-container-high overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-chip transition-[width] duration-base ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
