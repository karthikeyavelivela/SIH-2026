import { InputHTMLAttributes } from 'react';

interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  mode?: 'date' | 'datetime-local';
}

// Shared date/datetime input, styled to match SearchField/Select's
// machined-recess treatment — replaces the ad-hoc bare <input type="date">
// currently inline in /customer/book's schedule toggle.
export function DatePicker({ mode = 'datetime-local', className = '', ...props }: DatePickerProps) {
  return (
    <input
      type={mode}
      className={`w-full h-12 px-4 rounded-control bg-white/50 border border-fyro-ink/15 shadow-[inset_0_1px_2px_rgba(30,26,22,0.04)] font-body text-body-default text-fyro-ink focus:outline-none focus:border-fyro-ink focus:ring-1 focus:ring-fyro-ink transition-colors ${className}`}
      {...props}
    />
  );
}
