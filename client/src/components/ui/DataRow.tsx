import { ReactNode } from 'react';

interface DataRowProps {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  hint?: ReactNode;
  className?: string;
}

/**
 * One label/value record row. The design pairs a small uppercase label on
 * the left with the value set in the serif on the right, and never boxes
 * the individual row.
 */
export function DataRow({ label, value, icon, hint, className = '' }: DataRowProps) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && (
          <span className="text-fy-muted flex-shrink-0" aria-hidden="true">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-body text-eyebrow uppercase text-fy-muted truncate">{label}</p>
          {hint && <p className="font-body text-label text-fy-ink-soft truncate">{hint}</p>}
        </div>
      </div>
      <div className="font-body text-body font-semibold text-fy-ink text-right flex-shrink-0">{value}</div>
    </div>
  );
}
