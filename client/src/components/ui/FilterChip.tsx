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
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-semibold transition-colors ${
        active
          ? 'bg-fy-brown text-fy-on-brown'
          : 'bg-fy-field text-fy-ink-soft hover:bg-fy-well'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
