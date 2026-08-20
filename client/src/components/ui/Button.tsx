import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

// -600 shades used for solid fills — the base brand tokens (bright orange
// #FF6B2B / teal #0D9488) fail WCAG AA as a background under white text;
// the deepened shades stay in the same hue family and pass comfortably.
// Per the "Ink on Warm Paper" component rule: solid fill, no shadow/glow —
// depth on press comes from darkening the fill, not a drop shadow.
const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary-600 text-white hover:brightness-110 active:brightness-90',
  secondary: 'bg-secondary-600 text-white hover:brightness-110 active:brightness-90',
  ghost: 'bg-transparent text-text-primary border border-border-strong hover:bg-surface active:bg-surface-raised',
  danger: 'bg-red-700 text-white hover:brightness-110 active:brightness-90',
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
      className={`inline-flex items-center justify-center rounded-full font-heading font-bold transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
