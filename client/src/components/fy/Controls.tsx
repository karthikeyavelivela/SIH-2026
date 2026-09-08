'use client';

import { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

/* Controls — anatomy per DESIGN_TOKENS.md §4.
   Taken from: login (brown primary button, light secondary pair, green
   "Request Charter"), hamali_labour_standard (green sticky CTA, selection
   cards, material chips, ±crew stepper), goods_transport (slate CTA, slate
   commodity chips, hamali toggle), booking_history_1 (search field). */

type Variant = 'brown' | 'green' | 'slate' | 'lime' | 'light' | 'ghost';

const variantClass: Record<Variant, string> = {
  brown: 'bg-fy-brown text-fy-on-brown hover:brightness-110',
  green: 'bg-fy-green text-fy-on-green hover:brightness-110',
  slate: 'bg-fy-slate text-fy-on-slate hover:brightness-110',
  lime: 'bg-fy-lime text-fy-on-lime hover:brightness-105',
  light: 'bg-fy-field text-fy-ink hover:bg-fy-well',
  ghost: 'bg-transparent text-fy-ink border border-fy-hairline hover:bg-fy-ink/[0.03]',
};

const sizeClass = {
  md: 'h-11 px-4 text-body',
  lg: 'h-14 px-5 text-body',
} as const;

export function Button({
  variant = 'brown',
  size = 'lg',
  glyph,
  trailingGlyph,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: keyof typeof sizeClass;
  glyph?: string;
  trailingGlyph?: string;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-control font-body font-semibold transition-all active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed ${sizeClass[size]} ${variantClass[variant]} ${className}`}
      {...props}
    >
      {glyph && <Icon name={glyph} size={20} />}
      {children}
      {trailingGlyph && <Icon name={trailingGlyph} size={18} />}
    </button>
  );
}

/**
 * Chip. The designs use a *squarish* 12px radius for multi-select chips
 * (materials, commodities) and a fully-round one for filters and saved
 * locations — hence `shape`.
 */
export function Chip({
  active = false,
  glyph,
  accent = 'lime',
  shape = 'square',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  glyph?: string;
  accent?: 'lime' | 'slate' | 'brown';
  shape?: 'square' | 'round';
}) {
  const activeClass = {
    lime: 'bg-fy-lime-tint-2 text-fy-ink',
    slate: 'bg-fy-slate text-fy-on-slate',
    brown: 'bg-fy-brown text-fy-on-brown',
  }[accent];
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-2 font-body text-label font-medium transition-colors ${
        shape === 'square' ? 'rounded-control' : 'rounded-full'
      } ${active ? activeClass : 'bg-fy-well text-fy-ink-soft hover:bg-fy-edge'} ${className}`}
      {...props}
    >
      {glyph && <Icon name={glyph} size={16} />}
      {children}
    </button>
  );
}

export function ChipRow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>{children}</div>
  );
}

/** Horizontally scrolling variant — saved locations, specialist carousels. */
export function ScrollRow({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return (
    <div className={`flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden ${className}`} {...props}>
      {children}
    </div>
  );
}

/**
 * The ±crew stepper from hamali_labour_standard: two large circular white
 * buttons flanking a giant serif number with its label beneath.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label,
  className = '',
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  label?: ReactNode;
  className?: string;
}) {
  const btn =
    'w-14 h-14 rounded-full bg-fy-card text-fy-brown flex items-center justify-center shadow-card transition-transform active:scale-95 disabled:opacity-40';
  return (
    <div className={`flex items-center justify-center gap-6 ${className}`}>
      <button type="button" aria-label="Decrease" className={btn} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>
        <Icon name="remove" size={26} />
      </button>
      <div className="min-w-[100px] flex flex-col items-center">
        <span className="font-heading text-metric leading-none text-fy-brown tabular-nums">{value}</span>
        {label && <span className="font-body text-label text-fy-ink-soft mt-1">{label}</span>}
      </div>
      <button type="button" aria-label="Increase" className={btn} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>
        <Icon name="add" size={26} />
      </button>
    </div>
  );
}

/** Toggle — dark green when on, per goods_transport and customer_profile_1. */
export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  className = '',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center h-7 w-12 rounded-full shrink-0 transition-colors disabled:opacity-40 ${
        checked ? 'bg-fy-green' : 'bg-fy-edge'
      } ${className}`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-fy-card shadow-card transition-transform ${
          checked ? 'translate-x-[22px]' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/** Range slider — tonnage on hamali_labour_bulk, load on goods_transport. */
export function Slider({
  accent = 'green',
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { accent?: 'green' | 'slate' }) {
  const min = Number(props.min ?? 0);
  const max = Number(props.max ?? 100);
  const pct = Math.min(100, Math.max(0, ((Number(props.value) - min) / (max - min)) * 100));
  const fill = accent === 'green' ? 'var(--fy-green)' : 'var(--fy-slate)';
  return (
    <input
      type="range"
      className={`w-full h-2.5 rounded-full appearance-none cursor-pointer ${className}`}
      style={{ background: `linear-gradient(to right, ${fill} ${pct}%, var(--fy-well) ${pct}%)` }}
      {...props}
    />
  );
}

/** Search field — inset well, leading glyph, optional trailing filter glyph. */
export function SearchField({
  trailingGlyph,
  onTrailingClick,
  className = '',
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { trailingGlyph?: string; onTrailingClick?: () => void }) {
  return (
    <div
      className={`relative flex items-center h-12 rounded-control bg-fy-panel shadow-[inset_0_1px_2px_rgba(28,28,22,0.06)] px-4 ${className}`}
    >
      <Icon name="search" size={20} className="text-fy-muted shrink-0 mr-2" />
      <input
        type="search"
        className="w-full bg-transparent border-0 outline-none font-body text-body text-fy-ink placeholder:text-fy-muted/70"
        {...props}
      />
      {trailingGlyph && (
        <button type="button" onClick={onTrailingClick} className="shrink-0 text-fy-muted hover:text-fy-ink" aria-label="Filter">
          <Icon name={trailingGlyph} size={18} />
        </button>
      )}
    </div>
  );
}

/** Text/number input styled to match the login form's fields. */
export function Field({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full h-14 px-4 rounded-control bg-fy-field font-body text-body text-fy-ink placeholder:text-fy-muted/70 outline-none focus:ring-1 focus:ring-fy-brown transition-shadow ${className}`}
      {...props}
    />
  );
}

/**
 * The big selectable option card used for consignment scale, engagement
 * model and consignment strategy: tinted when selected, with a check-circle
 * on the right and an empty radio when not.
 */
export function SelectCard({
  selected,
  glyph,
  title,
  description,
  badge,
  accent = 'lime',
  compact = false,
  children,
  onClick,
  className = '',
}: {
  selected: boolean;
  glyph?: string;
  title: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  accent?: 'lime' | 'slate' | 'green';
  /** Drops the glyph row and tightens padding — the duration tiles. */
  compact?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const selectedSurface =
    accent === 'slate' ? 'bg-fy-slate-soft text-fy-on-slate' : 'bg-fy-lime-tint-1 text-fy-ink';
  const iconChip = selected
    ? accent === 'slate'
      ? 'bg-fy-slate text-fy-on-slate'
      : 'bg-fy-lime text-fy-green'
    : 'bg-fy-well text-fy-ink-soft';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`w-full text-left rounded-card transition-colors ${compact ? 'p-3' : 'p-3.5'} ${
        selected ? selectedSurface : 'bg-fy-panel text-fy-ink hover:bg-fy-well'
      } ${className}`}
    >
      <div className={`flex gap-3 ${compact ? 'flex-col' : 'items-start justify-between'}`}>
        <div className="flex items-start gap-3 min-w-0">
          {glyph && (
            <span className={`w-9 h-9 rounded-cell flex items-center justify-center shrink-0 mt-0.5 ${iconChip}`}>
              <Icon name={glyph} size={20} />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-body text-body font-semibold">{title}</span>
              {badge}
            </div>
            {description && (
              <p className={`font-body text-label mt-0.5 ${selected && accent === 'slate' ? 'text-fy-on-slate-soft' : 'text-fy-ink-soft'}`}>
                {description}
              </p>
            )}
            {children}
          </div>
        </div>
        {!compact && (
          <Icon
            name={selected ? 'check_circle' : 'radio_button_unchecked'}
            size={22}
            className={selected ? (accent === 'slate' ? 'text-fy-lime' : 'text-fy-green') : 'text-fy-hairline'}
          />
        )}
      </div>
    </button>
  );
}
