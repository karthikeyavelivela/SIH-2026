interface TrendChartProps {
  points: number[];
  labels?: string[];
  height?: number;
  accent?: 'primary' | 'secondary';
  className?: string;
}

// Dependency-free inline-SVG sparkline/line chart — revenue trend, weekly
// earnings. Not for anything needing tooltips/zoom/legends; reach for a
// real charting lib if a screen ever needs that.
export function TrendChart({ points, labels, height = 80, accent = 'primary', className = '' }: TrendChartProps) {
  if (points.length < 2) return null;
  const width = 300;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const coords = points.map((p, i) => `${i * stepX},${height - ((p - min) / range) * (height - 8) - 4}`);
  const stroke = accent === 'primary' ? 'var(--ip-primary)' : 'var(--ip-secondary)';
  const fillId = `trend-fill-${accent}`;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={coords.join(' ')} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        <polygon points={`0,${height} ${coords.join(' ')} ${width},${height}`} fill={`url(#${fillId})`} />
      </svg>
      {labels && (
        <div className="flex justify-between text-xs text-ip-on-surface-variant mt-1">
          {labels.map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
