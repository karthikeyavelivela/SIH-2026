import { ReactNode } from 'react';

/**
 * The marketing set's shared editorial furniture.
 *
 * The landing page established the public site's language — a numbered
 * monograph rule over each section, a serif display head with one italic
 * accent line, mono micro-labels, and generous bone/panel plates. These are
 * that language extracted so the seven content pages read as chapters of the
 * same document rather than seven differently-styled pages.
 *
 * Server-safe: no hooks, no client directive, so the content pages stay
 * server components and keep rendering their copy without shipping JS.
 */

/** The numbered rule that opens every section, as on the landing page. */
export function SectionRule({ num, label, right }: { num: string; label: string; right?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-fy-brown/15 pb-4 mb-10 font-mono text-[11px] uppercase tracking-widest text-fy-muted">
      <span className="text-fy-brown font-bold flex items-center gap-2 min-w-0">
        <span aria-hidden className="w-1.5 h-1.5 bg-fy-green shrink-0" />
        <span className="truncate">
          {num} / {label}
        </span>
      </span>
      {right && <span className="hidden md:inline shrink-0">{right}</span>}
    </div>
  );
}

/**
 * The page head. `accent` is set in the green italic the landing uses for
 * the second line of its headline.
 */
export function PageHead({
  eyebrow,
  title,
  accent,
  lede,
  aside,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  lede?: string;
  aside?: ReactNode;
}) {
  return (
    <header className="pt-6 pb-12 border-b border-fy-brown/15 mb-12">
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <span aria-hidden className="w-8 h-[2px] bg-fy-green" />
        <span className="font-mono text-[11px] tracking-[0.25em] uppercase text-fy-brown font-semibold">
          {eyebrow}
        </span>
      </div>
      <h1 className="font-heading font-normal text-[2.2rem] sm:text-5xl lg:text-6xl leading-[1.02] tracking-[-0.03em] text-fy-ink uppercase max-w-4xl">
        {title}
        {accent && (
          <>
            {' '}
            <span className="italic font-light text-fy-green lowercase normal-case">{accent}</span>
          </>
        )}
      </h1>
      {lede && (
        <p className="mt-6 font-body text-body-lg text-fy-ink-soft font-light leading-relaxed max-w-2xl">{lede}</p>
      )}
      {aside && <div className="mt-8">{aside}</div>}
    </header>
  );
}

/** A page section beneath its numbered rule. */
export function Chapter({
  num,
  label,
  right,
  children,
  id,
}: {
  num: string;
  label: string;
  right?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="mb-16">
      <SectionRule num={num} label={label} right={right} />
      {children}
    </section>
  );
}

/** The bordered plate the landing uses for every card-shaped block. */
export function Plate({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-fy-card border border-fy-brown/15 rounded-card p-6 shadow-card ${className}`}>{children}</div>
  );
}

/** A titled prose block — the shape every "for customers / for drivers" entry takes. */
export function ProseBlock({
  index,
  title,
  body,
  glyph,
}: {
  index?: string;
  title: string;
  body: string;
  glyph?: string;
}) {
  return (
    <Plate className="flex flex-col gap-3 h-full">
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2.5 min-w-0">
          {glyph && (
            <span
              aria-hidden
              className="material-symbols-outlined text-[20px] text-fy-green shrink-0 leading-none"
            >
              {glyph}
            </span>
          )}
          <h3 className="font-heading text-title text-fy-ink">{title}</h3>
        </span>
        {index && <span className="font-mono text-[10px] text-fy-brown font-bold shrink-0">{index}</span>}
      </div>
      <p className="font-body text-body text-fy-ink-soft leading-relaxed">{body}</p>
    </Plate>
  );
}

/** The page shell — gutter, max width and the grain wash the landing uses. */
export function EditorialPage({ children }: { children: ReactNode }) {
  return (
    <div className="bg-fy-bone text-fy-ink relative">
      <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain opacity-50 z-0" />
      <div className="relative z-10 max-w-5xl mx-auto px-gutter lg:px-8 pb-20">{children}</div>
    </div>
  );
}
