import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

// The design's buttons: a solid accent fill with no glow, depth on press
// coming from the fill darkening rather than a drop shadow. `danger` uses
// the palette's own error colour rather than Tailwind red.
const variantClasses: Record<Variant, string> = {
  primary: 'bg-fy-brown text-fy-on-brown hover:brightness-110 active:brightness-95',
  secondary: 'bg-fy-green text-fy-on-green hover:brightness-110 active:brightness-95',
  ghost: 'bg-fy-field text-fy-ink hover:bg-fy-well active:bg-fy-dim',
  danger: 'bg-fy-error text-fy-on-brown hover:brightness-110 active:brightness-95',
};

// 14px radius controls, 56px tall for the primary action — matching
// fy/Controls' Button so the two never disagree on a shared screen.
const sizeClasses: Record<Size, string> = {
  md: 'px-5 h-12 text-label min-h-[44px]',
  lg: 'px-7 h-14 text-body min-h-[52px]',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-control font-body font-semibold transition-all duration-fast disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}
