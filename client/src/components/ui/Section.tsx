import { ReactNode } from 'react';

interface SectionProps {
  title?: string;
  description?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}

// The v3 rhythm unit — DESIGN.md's "dense data followed by open, breathable
// margins". Every page's body is a stack of these, not ad-hoc <div>s.
export function Section({ title, description, right, children, className = '' }: SectionProps) {
  return (
    <section className={`flex flex-col gap-4 ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3">
          {title && <h2 className="font-heading text-title text-fy-ink">{title}</h2>}
          {right}
        </div>
      )}
      {description && <p className="font-body text-body text-fy-ink-soft -mt-2">{description}</p>}
      {children}
    </section>
  );
}
