import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Serif title, muted body, optional action — the designs' empty pattern. */
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center gap-3 py-12 px-6 ${className}`}>
      {icon && (
        <div
          className="w-14 h-14 rounded-full bg-fy-well flex items-center justify-center text-fy-muted"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3 className="font-heading text-title text-fy-ink">{title}</h3>
      {description && <p className="font-body text-label text-fy-ink-soft max-w-xs">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
