interface QueueCounterProps {
  count: number;
  label: string;
  tone?: 'primary' | 'danger' | 'muted';
  className?: string;
}

// "12 remaining" style tile — KYC verification queue, pending disputes,
// unresolved fraud alerts.
export function QueueCounter({ count, label, tone = 'primary', className = '' }: QueueCounterProps) {
  const color = tone === 'danger' ? 'text-fy-error' : tone === 'muted' ? 'text-fy-ink-soft' : 'text-fy-brown';
  return (
    <div className={`fy-surface-card ${className}`}>
      <p className={`font-heading font-extrabold text-heading tabular-nums ${color}`}>{count}</p>
      <p className="text-label text-fy-ink-soft">{label}</p>
    </div>
  );
}
