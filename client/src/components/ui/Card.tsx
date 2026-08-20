import { HTMLAttributes } from 'react';

type Elevation = 'flat' | 'raised';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
}

// Tonal, not shadow-based, per the "Ink on Warm Paper" component rule:
// depth comes from the surface/surface-raised tone shift, never a drop
// shadow. `flat` sits directly on the page surface tone (content grouped
// inside an already-elevated context); `raised` is the default — pure
// white so it separates from the warm-beige page without needing a border.
export function Card({ elevation = 'raised', className = '', ...props }: CardProps) {
  const base = elevation === 'raised' ? 'bg-surface-raised' : 'bg-surface';
  return <div className={`${base} rounded-lg p-6 ${className}`} {...props} />;
}
