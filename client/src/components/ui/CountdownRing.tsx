'use client';

interface CountdownRingProps {
  /** Seconds remaining, already ticking down in the parent (server is source of truth for the deadline). */
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
  accent?: 'primary' | 'secondary';
  children?: React.ReactNode;
}

// Circular countdown for sequential timed job offers (driver_job_offer,
// hamali_job_offer). Per PRODUCT.md's "honesty over polish that lies":
// this only ever renders a countdown the parent is driving from a real
// server-issued expiry, never a decorative loop.
export function CountdownRing({ secondsLeft, totalSeconds, size = 96, accent = 'primary', children }: CountdownRingProps) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const offset = circumference * (1 - progress);
  const stroke = accent === 'primary' ? 'var(--ip-primary)' : 'var(--ip-secondary)';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${secondsLeft} seconds remaining`}>
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
          style={{ transition: 'stroke-dashoffset 1s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-heading font-bold text-ip-on-surface">
        {children ?? secondsLeft}
      </div>
    </div>
  );
}
