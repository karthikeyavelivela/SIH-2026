interface RatingHistogramProps {
  counts: Record<1 | 2 | 3 | 4 | 5, number>;
  className?: string;
}

// The star-histogram pattern PAGE_INVENTORY.md found on driver's profile
// and asked to be carried to customer's new /customer/reputation page.
// One shared implementation instead of reinventing per role.
export function RatingHistogram({ counts, className = '' }: RatingHistogramProps) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const avg = Object.entries(counts).reduce((sum, [star, n]) => sum + Number(star) * n, 0) / total;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-data-metric text-fyro-ink">{total ? avg.toFixed(1) : '—'}</span>
        <span className="font-body text-body-default text-ip-on-surface-variant">from {total} rating{total === 1 ? '' : 's'}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const n = counts[star] ?? 0;
          const pct = (n / total) * 100;
          return (
            <div key={star} className="flex items-center gap-2">
              <span className="w-3 text-xs font-body text-ip-on-surface-variant tabular-nums">{star}</span>
              <div className="flex-1 h-2 rounded-chip bg-ip-surface-container-high overflow-hidden">
                <div className="h-full bg-accent-labour rounded-chip" style={{ width: `${pct}%` }} />
              </div>
              <span className="w-6 text-right text-xs font-body text-ip-on-surface-variant tabular-nums">{n}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
