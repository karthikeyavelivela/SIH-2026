interface ProgressBarProps {
  value: number; // 0-100
  tone?: 'household' | 'labour' | 'transport';
  label?: string;
  className?: string;
}

export function ProgressBar({ value, tone = 'labour', label, className = '' }: ProgressBarProps) {
  const fillClass = { household: 'bg-fy-brown', labour: 'bg-fy-lime', transport: 'bg-fy-slate' }[tone];
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={className}>
      {label && (
        <div className="flex justify-between mb-1.5">
          <span className="font-body text-label text-fy-ink-soft">{label}</span>
          <span className="font-body text-label tabular-nums text-fy-ink">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="h-2 rounded-full bg-fy-well overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full rounded-full transition-[width] duration-base ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
