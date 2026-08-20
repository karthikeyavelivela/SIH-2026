import { ReactNode } from 'react';

interface DataRowProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  hint?: string;
  className?: string;
}

// A single label/value line — manifest line items, ledger rows, fare
// breakdown lines, fleet unit stats. Deliberately has no border of its own;
// stack rows inside a `.ip-card` and add `<ListDivider />` between them.
export function DataRow({ label, value, icon, hint, className = '' }: DataRowProps) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="text-ip-outline flex-shrink-0" aria-hidden="true">{icon}</span>}
        <div className="min-w-0">
          <p className="text-ip-body-sm text-ip-on-surface-variant truncate">{label}</p>
          {hint && <p className="text-xs text-ip-outline truncate">{hint}</p>}
        </div>
      </div>
      <div className="font-heading font-semibold text-ip-on-surface text-right flex-shrink-0">{value}</div>
    </div>
  );
}
