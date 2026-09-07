import { ReactNode } from 'react';
import { EyebrowLabel } from './Text';

/* Data display — anatomy per DESIGN_TOKENS.md §4.
   Taken from: worker_dashboard_online (₹2,840 earnings metric),
   live_tracking_1 ("14 mins" + "2.8 KM LEFT" badge), admin_overview (KPI
   cards), society_governance (label/value register rows, trustee list),
   customer_profile_1 (personal-record rows). */

type MetricTone = 'ink' | 'brown' | 'lime' | 'green' | 'error';

const metricTone: Record<MetricTone, string> = {
  ink: 'text-fy-ink',
  brown: 'text-fy-brown',
  lime: 'text-fy-lime',
  green: 'text-fy-green',
  error: 'text-fy-error',
};

/**
 * The hero number. Eyebrow above, giant serif figure, unit sitting on the
 * same baseline at roughly half the number's size, supporting line beneath.
 */
export function MetricBlock({
  label,
  value,
  unit,
  tone = 'brown',
  note,
  aside,
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  tone?: MetricTone;
  note?: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <EyebrowLabel>{label}</EyebrowLabel>
        <div className="flex items-baseline gap-1.5 mt-1">
          <span className={`font-heading text-metric leading-none ${metricTone[tone]}`}>{value}</span>
          {unit && <span className={`font-heading text-title ${metricTone[tone]}`}>{unit}</span>}
        </div>
        {note && <div className="mt-1.5 font-body text-label text-fy-ink-soft">{note}</div>}
      </div>
      {aside}
    </div>
  );
}

/** One label/value pair — the register rows on society_governance. */
export function StatRow({
  label,
  value,
  valueTone = 'ink',
  className = '',
}: {
  label: ReactNode;
  value: ReactNode;
  valueTone?: 'ink' | 'green' | 'error';
  className?: string;
}) {
  const tone =
    valueTone === 'green' ? 'text-fy-green' : valueTone === 'error' ? 'text-fy-error' : 'text-fy-ink';
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      <EyebrowLabel>{label}</EyebrowLabel>
      <span className={`font-body text-body font-semibold ${tone}`}>{value}</span>
    </div>
  );
}

/** Hairline-separated rows. No boxing per row, no vertical rules. */
export function DataList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`flex flex-col divide-y divide-fy-hairline/60 ${className}`}>{children}</div>;
}

export function DataRow({
  lead,
  title,
  meta,
  trailing,
  onClick,
  className = '',
}: {
  lead?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const inner = (
    <>
      {lead && <div className="shrink-0">{lead}</div>}
      <div className="flex-1 min-w-0">
        <div className="font-body text-body font-semibold text-fy-ink truncate">{title}</div>
        {meta && <div className="font-body text-label text-fy-muted truncate">{meta}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
    </>
  );
  const cls = `w-full flex items-center gap-3 py-3.5 text-left ${
    onClick ? 'transition-colors hover:bg-fy-ink/[0.02]' : ''
  } ${className}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

/** Thin progress bar — sits at the bottom of KPI cards and queue rows. */
export function ProgressBar({
  value,
  tone = 'green',
  className = '',
}: {
  value: number;
  tone?: 'green' | 'lime' | 'error' | 'brown';
  className?: string;
}) {
  const fill = {
    green: 'bg-fy-green',
    lime: 'bg-fy-lime',
    error: 'bg-fy-error',
    brown: 'bg-fy-brown',
  }[tone];
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div
      className={`h-1.5 rounded-full bg-fy-well overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
    </div>
  );
}
