import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

// -600 shades used for solid fills — the base brand tokens (bright orange
// #FF6B2B / teal #0D9488) fail WCAG AA as a background under white text;
// the deepened shades stay in the same hue family and pass comfortably.
const variantClasses: Record<Variant, string> = {
  primary:
    'bg-primary-600 text-white shadow-md hover:shadow-glow-primary hover:-translate-y-0.5 active:translate-y-0',
  secondary:
    'bg-secondary-600 text-white shadow-md hover:shadow-glow-secondary hover:-translate-y-0.5 active:translate-y-0',
  ghost:
    'bg-transparent text-text-primary border border-border-strong hover:bg-surface hover:-translate-y-0.5 active:translate-y-0',
  danger:
    'bg-red-600 text-white shadow-md hover:bg-red-700 hover:-translate-y-0.5 active:translate-y-0',
};

const sizeClasses: Record<Size, string> = {
  md: 'px-5 py-2.5 text-sm min-h-[44px]',
  lg: 'px-7 py-3.5 text-base min-h-[52px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-full font-semibold transition-all duration-base ease-out-expo disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
