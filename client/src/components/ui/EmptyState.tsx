import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

// "No drivers available", "No disputes in queue", empty load board, etc —
// a real explanation, never a silent blank screen (Accessibility &
// Inclusion principle: "never a silent failure").
export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center text-center gap-3 py-16 px-6 ${className}`}>
      {icon && (
        <div className="w-16 h-16 rounded-full bg-fy-field flex items-center justify-center text-fy-muted" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="font-heading font-bold text-lg text-fy-ink">{title}</h3>
      {description && <p className="text-sm text-fy-ink-soft max-w-xs">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
