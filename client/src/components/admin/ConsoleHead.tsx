import { ReactNode } from 'react';

/**
 * The page head every console screen opens with.
 *
 * The admin overview established it — a green rule and mono eyebrow, a serif
 * heading, one line of explanation, and an optional control on the right.
 * The remaining console pages each had their own slightly different version
 * of the same three lines; this is the one version.
 */
export function ConsoleHead({
  eyebrow,
  title,
  subtitle,
  aside,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-7">
      <div className="min-w-0">
        <span className="flex items-center gap-2.5 mb-2">
          <span aria-hidden className="w-7 h-[2px] bg-fy-green" />
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-fy-brown">{eyebrow}</span>
        </span>
        <h1 className="font-heading text-heading font-extrabold mb-1">{title}</h1>
        {subtitle && <p className="font-body text-body text-fy-ink-soft">{subtitle}</p>}
      </div>
      {aside && <div className="shrink-0">{aside}</div>}
    </div>
  );
}

/** The console search field — same recess the roster screens use. */
export function ConsoleSearch({
  value,
  onChange,
  onSubmit,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <span
        aria-hidden
        className="material-symbols-outlined pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[18px] text-fy-muted leading-none"
      >
        search
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        className="w-full min-h-[46px] pl-10 pr-4 rounded-cell border border-fy-brown/15 bg-fy-card shadow-card font-body text-body text-fy-ink placeholder:text-fy-muted/70 outline-none focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/15 transition-shadow"
      />
    </div>
  );
}
