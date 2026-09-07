import { ButtonHTMLAttributes, ReactNode } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string; // always required — an icon-only control needs an accessible name
  variant?: 'ghost' | 'filled';
}

export function IconButton({ icon, label, variant = 'ghost', className = '', ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center transition-colors ${
        variant === 'filled'
          ? 'bg-fy-well text-fy-ink hover:bg-fy-edge'
          : 'text-fy-ink-soft hover:text-fy-ink hover:bg-fy-ink/5'
      } ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
}
