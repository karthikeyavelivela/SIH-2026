interface SkeletonProps {
  className?: string;
  /** Number of stacked lines when used for text placeholders. */
  lines?: number;
}

// Loading placeholder — respects prefers-reduced-motion globally (the pulse
// keyframe is a plain opacity animation, covered by the global media query
// in globals.css that clamps all animation-duration to 0.01ms).
export function Skeleton({ className = '', lines }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`animate-pulse rounded-md bg-ip-surface-container-high ${className}`}
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    );
  }
  return <div className={`animate-pulse rounded-md bg-ip-surface-container-high ${className}`} />;
}
