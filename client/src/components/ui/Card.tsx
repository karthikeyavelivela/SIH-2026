import { HTMLAttributes } from 'react';

type Elevation = 'raised' | 'flat';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
}

/**
 * `raised` is the design's white record panel (with its soft card shadow);
 * `flat` is the light panel surface. 16px radius and 16px padding, per
 * DESIGN_TOKENS.md — the old 24px padding made every card on a phone read
 * as one item taller than the design's.
 */
export function Card({ elevation = 'raised', className = '', ...props }: CardProps) {
  const base = elevation === 'raised' ? 'bg-fy-card shadow-card' : 'bg-fy-panel';
  return <div className={`${base} rounded-card p-4 ${className}`} {...props} />;
}
