import { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subline?: string;
  right?: ReactNode;
  className?: string;
}

// Huge Fraunces heading + a small Inter subline — the v3 top-of-page
// pattern (DESIGN.md's headline-lg / body-lg pairing). Distinct from
// TopBar, which is the fixed-position app-shell chrome with a back button;
// PageHeader sits inline in scroll content, once per page/section.
export function PageHeader({ title, subline, right, className = '' }: PageHeaderProps) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-heading text-heading md:text-heading text-fy-ink tracking-tight">{title}</h1>
        {subline && <p className="font-body text-body-lg text-fy-ink-soft max-w-xl">{subline}</p>}
      </div>
      {right && <div className="shrink-0 pt-1">{right}</div>}
    </div>
  );
}
