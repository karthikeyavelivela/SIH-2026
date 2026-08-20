interface CircularGaugeProps {
  /** 0-100 */
  value: number;
  size?: number;
  label?: string;
  accent?: 'primary' | 'secondary' | 'error';
  children?: React.ReactNode;
}

// Static percentage ring — fleet health score, deployment rate, module
// completion. Sibling to CountdownRing (which is time-driven, ticks down);
// this one just renders a fixed value.
export function CircularGauge({ value, size = 88, label, accent = 'primary', children }: CircularGaugeProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - pct / 100);
  const stroke =
    accent === 'primary' ? 'var(--ip-primary)' : accent === 'secondary' ? 'var(--ip-secondary)' : 'var(--ip-error)';

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--ip-surface-container-high)" strokeWidth={6} fill="none" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={stroke}
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-heading font-bold text-ip-on-surface tabular-nums">
          {children ?? `${Math.round(pct)}%`}
        </div>
      </div>
      {label && <p className="text-xs text-ip-on-surface-variant text-center">{label}</p>}
    </div>
  );
}
