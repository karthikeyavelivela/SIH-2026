import { InputHTMLAttributes } from 'react';

interface SearchFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

// DESIGN.md's "Machined Recesses" input treatment — inset shadow, not a
// raised field. Used for booking-history search, admin table filters.
export function SearchField({ onClear, value, className = '', ...props }: SearchFieldProps) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <svg className="absolute left-3.5 w-4 h-4 text-fy-muted pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.35-4.35" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        className="w-full h-12 pl-10 pr-10 rounded-control bg-white/50 border border-fy-ink/15 shadow-[inset_0_1px_2px_rgba(30,26,22,0.04)] font-body text-body text-fy-ink placeholder:text-fy-muted focus:outline-none focus:border-fy-ink focus:ring-1 focus:ring-fy-ink transition-colors"
        {...props}
      />
      {onClear && value ? (
        <button type="button" onClick={onClear} aria-label="Clear search" className="absolute right-3 w-5 h-5 flex items-center justify-center text-fy-muted hover:text-fy-ink">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" /></svg>
        </button>
      ) : null}
    </div>
  );
}
