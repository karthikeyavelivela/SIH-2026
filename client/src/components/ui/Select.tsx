import { SelectHTMLAttributes } from 'react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: SelectOption[];
  placeholder?: string;
}

export function Select({ options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={`w-full h-12 pl-4 pr-10 rounded-control bg-white/50 border border-fyro-ink/15 shadow-[inset_0_1px_2px_rgba(30,26,22,0.04)] font-body text-body-default text-fyro-ink appearance-none focus:outline-none focus:border-fyro-ink focus:ring-1 focus:ring-fyro-ink transition-colors ${className}`}
        {...props}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <svg className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ip-outline pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
