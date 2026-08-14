import { HTMLAttributes } from 'react';

type Elevation = 'flat' | 'raised';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
}

// `flat` sits directly on the page surface tone (for content grouped inside
// an already-elevated context). `raised` is the default — a real card that
// reads as sitting above the page via shadow, not just a border, on the
// pure-white surface-raised tone so it separates from the warm-beige page bg.
export function Card({ elevation = 'raised', className = '', ...props }: CardProps) {
  const base = elevation === 'raised' ? 'bg-surface-raised shadow-md' : 'bg-surface';
  return (
    <div
      className={`${base} rounded-lg p-6 border border-border ${className}`}
      {...props}
    />
  );
}
