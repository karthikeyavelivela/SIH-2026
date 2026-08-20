interface QueueCounterProps {
  count: number;
  label: string;
  tone?: 'primary' | 'danger' | 'muted';
  className?: string;
}

// "12 remaining" style tile — KYC verification queue, pending disputes,
// unresolved fraud alerts.
export function QueueCounter({ count, label, tone = 'primary', className = '' }: QueueCounterProps) {
  const color = tone === 'danger' ? 'text-ip-error' : tone === 'muted' ? 'text-ip-on-surface-variant' : 'text-ip-primary';
  return (
    <div className={`ip-card ${className}`}>
      <p className={`font-heading font-extrabold text-ip-display-md tabular-nums ${color}`}>{count}</p>
      <p className="text-ip-body-sm text-ip-on-surface-variant">{label}</p>
    </div>
  );
}
