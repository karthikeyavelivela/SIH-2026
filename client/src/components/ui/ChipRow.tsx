import { ReactNode } from 'react';

interface ChipRowProps {
  children: ReactNode;
  className?: string;
}

// Horizontal-scroll wrapper for a row of FilterChip/Chip controls —
// category pickers, filter bars. Snaps, hides its own scrollbar, and
// never clips the first/last chip's focus ring.
export function ChipRow({ children, className = '' }: ChipRowProps) {
  return (
    <div className={`flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x [&::-webkit-scrollbar]:hidden ${className}`}>
      {children}
    </div>
  );
}
