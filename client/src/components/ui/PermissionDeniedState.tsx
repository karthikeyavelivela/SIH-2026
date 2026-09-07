interface PermissionDeniedStateProps {
  title?: string;
  description?: string;
  className?: string;
}

// The direct fix for the reproduced /admin/users bug: a 403 must render as
// "you don't have access", never as EmptyState's "there's nothing here".
// Distinct third look (neither neutral EmptyState nor amber ErrorState) —
// a lock glyph on a muted-ink well, so the three states are visually
// unmistakable from each other even at a glance.
export function PermissionDeniedState({
  title = "You don't have access to this",
  description = 'Ask an admin to grant the right permission if you think this is wrong.',
  className = '',
}: PermissionDeniedStateProps) {
  return (
    <div className={`flex flex-col items-center text-center gap-3 py-16 px-6 ${className}`} role="alert">
      <div className="w-16 h-16 rounded-full bg-fy-ink/8 flex items-center justify-center text-fy-ink" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" strokeLinecap="round" />
        </svg>
      </div>
      <h3 className="font-heading font-bold text-lg text-fy-ink">{title}</h3>
      <p className="text-sm text-fy-ink-soft max-w-xs">{description}</p>
    </div>
  );
}
