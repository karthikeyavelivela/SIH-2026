import { ReactNode } from 'react';

interface FlatRowListProps {
  children: ReactNode;
  className?: string;
}

interface FlatRowProps {
  left: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
}

// DESIGN.md's "Lists & Ledger Rows": hairline-separated, NOT boxed cards.
// The passbook/ledger look — left-aligned record, right-aligned figure in
// tabular Fraunces numerals. Use this instead of a Card-per-row wherever
// the inventory found a plain list (booking history, notifications,
// complaint history, member rosters).
export function FlatRowList({ children, className = '' }: FlatRowListProps) {
  return <div className={`flex flex-col divide-y divide-[color:var(--fy-hairline)] ${className}`}>{children}</div>;
}

export function FlatRow({ left, right, onClick, href, className = '' }: FlatRowProps) {
  const rowClassName = `w-full flex items-center justify-between gap-4 py-3.5 text-left transition-colors ${
    onClick || href ? 'hover:bg-fy-ink/[0.02] cursor-pointer' : ''
  } ${className}`;
  const content = (
    <>
      <div className="flex-1 min-w-0 font-body text-body text-fy-ink">{left}</div>
      {right && <div className="shrink-0 font-heading text-body tabular-nums text-fy-ink-soft">{right}</div>}
    </>
  );

  if (href) {
    return (
      <a href={href} className={rowClassName}>
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={rowClassName}>
        {content}
      </button>
    );
  }
  return <div className={rowClassName}>{content}</div>;
}
