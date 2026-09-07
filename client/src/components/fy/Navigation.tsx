'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

/* Navigation — anatomy per DESIGN_TOKENS.md §4.
   Taken from: household_home / customer_profile_1 (bottom bar, brand block,
   receipt + avatar actions), live_tracking_1 (back arrow + serif title top
   bar, and the Status/Chat/Payment/Custody tab row), society_governance
   (Affiliation/Bye-laws/Equity pill tab row). */

export interface TabItem {
  href: string;
  label: string;
  glyph: string;
}

/**
 * Fixed bottom bar. Icon above a 12px label; active item is ink, inactive is
 * muted — no pill, no underline, no background change (measured).
 */
export function BottomTabBar({
  items,
  size = 'default',
}: {
  items: TabItem[];
  /**
   * The design set has exactly two bars, and they are consistent within each
   * shell rather than in conflict: the signed-in customer shell is 80px with
   * four 24px tabs (household_home, customer_profile_1), the marketing shell
   * is 64px with five 22px tabs and the smaller caps label (landing).
   */
  size?: 'default' | 'compact';
}) {
  const pathname = usePathname();
  const compact = size === 'compact';
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 bg-fy-bone/92 backdrop-blur-xl border-t border-fy-hairline/40"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className={`${compact ? 'h-16' : 'h-20'} max-w-2xl mx-auto flex items-center justify-around px-2`}
      >
        {items.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[44px] px-2 transition-colors ${
                active ? 'text-fy-ink' : 'text-fy-muted hover:text-fy-ink-soft'
              }`}
            >
              <Icon name={item.glyph} size={compact ? 22 : 24} filled={active} />
              <span
                className={`font-body ${compact ? 'text-eyebrow normal-case' : 'text-label'} ${
                  active ? 'font-semibold' : ''
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Fixed top bar, 64px. Two shapes appear in the designs: a brand block
 * (eyebrow + serif title) and a back-arrow + serif title. `onBack` picks
 * the second.
 */
export function TopBar({
  eyebrow,
  title,
  onBack,
  showBack = false,
  actions,
  className = '',
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
  actions?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  return (
    <header
      className={`fixed top-0 inset-x-0 z-40 bg-fy-bone/88 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,28,22,0.03)] ${className}`}
    >
      <div className="h-16 max-w-2xl mx-auto px-gutter flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={onBack ?? (() => router.back())}
              aria-label="Back"
              className="w-11 h-11 -ml-2 rounded-full flex items-center justify-center text-fy-ink hover:bg-fy-field transition-colors shrink-0"
            >
              <Icon name="arrow_back" size={20} />
            </button>
          )}
          <div className="flex flex-col min-w-0">
            {eyebrow && (
              <span className="font-body text-eyebrow uppercase text-fy-muted leading-none">{eyebrow}</span>
            )}
            <h1 className="font-heading text-title text-fy-ink leading-tight truncate">{title}</h1>
          </div>
        </div>
        {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * Tab row. Two variants in the designs: `pill` (active = brown pill, on
 * society_governance) and `inset` (active = white pill inside a light track,
 * on live_tracking_1).
 */
export function TabRow({
  tabs,
  active,
  onChange,
  variant = 'pill',
  className = '',
}: {
  tabs: { key: string; label: string; glyph?: string }[];
  active: string;
  onChange: (key: string) => void;
  variant?: 'pill' | 'inset' | 'segment';
  className?: string;
}) {
  // `segment` is the squared-off version on landing's rate estimator: a
  // 12px-radius track holding 8px-radius buttons, active one white.
  const round = variant === 'segment' ? 'rounded-control' : 'rounded-full';
  const buttonRound = variant === 'segment' ? 'rounded-cell' : 'rounded-full';
  return (
    <div
      role="tablist"
      className={`flex items-center gap-1 p-1 ${round} ${
        variant === 'pill' ? 'bg-fy-field' : 'bg-fy-well'
      } ${className}`}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        const activeClass =
          variant === 'pill' ? 'bg-fy-brown text-fy-on-brown' : 'bg-fy-card text-fy-ink shadow-card';
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(t.key)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 ${buttonRound} font-body text-label whitespace-nowrap transition-colors ${
              on ? `${activeClass} font-semibold` : 'text-fy-ink-soft hover:text-fy-ink'
            }`}
          >
            {t.glyph && <Icon name={t.glyph} size={16} />}
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
