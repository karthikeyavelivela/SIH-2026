import { ButtonHTMLAttributes } from 'react';

interface FilterChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

// Toggle chip — load-board filters (distance/price/weight/urgency), cargo
// type selectors. Distinct from LanguagePill (single-select segmented
// group) — chips are independent toggles, often multiple active at once.
export function FilterChip({ active = false, className = '', children, ...props }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-ip-pill text-sm font-semibold transition-colors ${
        active
          ? 'bg-ip-primary text-ip-on-primary'
          : 'bg-ip-surface-container text-ip-on-surface-variant hover:bg-ip-surface-container-high'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
