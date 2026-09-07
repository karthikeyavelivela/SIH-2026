import { ReactNode } from 'react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  icon?: ReactNode;
  className?: string;
}

// Visually distinct from EmptyState on purpose — this is Phase 0.6's other
// half of the fix: a failed fetch must never render pixel-identical to an
// honest zero-results page. Warning-tone icon well + a real retry action,
// where EmptyState's is neutral and offers a "go do the thing" CTA instead.
export function ErrorState({ title = 'Something went wrong', description = 'We could not load this. Check your connection and try again.', onRetry, icon, className = '' }: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center text-center gap-3 py-16 px-6 ${className}`} role="alert">
      <div className="w-16 h-16 rounded-full bg-fy-peach flex items-center justify-center text-fy-brown" aria-hidden="true">
        {icon ?? (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <h3 className="font-heading font-bold text-lg text-fy-ink">{title}</h3>
      <p className="text-sm text-fy-ink-soft max-w-xs">{description}</p>
      {onRetry && (
        <Button variant="secondary" size="md" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}
