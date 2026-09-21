'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
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
  centre,
}: {
  items: TabItem[];
  /**
   * A raised action button in the middle of the bar, with the tabs split
   * around it. Not a destination — it opens something (for the customer
   * shell, the mode switch), so it is a button and never carries
   * aria-current.
   *
   * `items` must have an even length when this is set, or the split is
   * lopsided; the customer shell passes four.
   */
  centre?: { label: string; glyph: string; onPress: () => void };
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

  // Publish the bar's height so pages can reserve exactly the right amount
  // of bottom padding and sticky CTAs can sit exactly on top of it. Without
  // this, every page guesses — which is how the primary button on the
  // service and hamali screens ended up underneath the nav.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--fy-nav-h', compact ? '4rem' : '5rem');
    return () => {
      root.style.removeProperty('--fy-nav-h');
    };
  }, [compact]);

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 bg-fy-bone/92 backdrop-blur-xl border-t border-fy-hairline/40"
      style={{ paddingBottom: 'var(--fy-safe-b)' }}
    >
      <div
        className={`${compact ? 'h-16' : 'h-20'} max-w-2xl mx-auto flex items-center justify-around px-2`}
      >
        {items.map((item, i) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname?.startsWith(item.href + '/');
          const tab = (
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

          // The raised button sits between the two halves of the bar. It
          // overflows the bar upwards, which is the whole point of the
          // shape — so the bar itself must not clip it.
          if (centre && i === Math.floor(items.length / 2)) {
            return (
              <Fragment key="centre-and-tab">
                <button
                  type="button"
                  onClick={centre.onPress}
                  aria-label={centre.label}
                  className="relative -mt-7 w-14 h-14 shrink-0 rounded-full bg-fy-brown text-fy-on-brown shadow-float flex items-center justify-center ring-4 ring-fy-bone transition-transform active:scale-95"
                >
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 30%, var(--fy-brown-soft) 0%, var(--fy-brown) 62%, var(--fy-ink) 100%)',
                    }}
                  />
                  <Icon name={centre.glyph} size={24} className="relative text-fy-lime" />
                </button>
                {tab}
              </Fragment>
            );
          }
          return tab;
        })}
      </div>
    </nav>
  );
}

/**
 * The sticky action bar that carries a screen's primary button.
 *
 * Every page that had one positioned it by hand at `bottom-16` with `z-30`,
 * against a tab bar that is 80px tall, sits at `z-40`, and adds the device's
 * home-indicator inset on top. The result was visible in production: on
 * /customer/service/[slug] the button read "Request servi…" and on the
 * hamali screen "Continue with 1 worker" was half behind the nav.
 *
 * This sits on top of the tab bar by construction (`fy-above-nav` reads the
 * height the bar itself published) and shares its stacking level, so the
 * nav's translucent backdrop can no longer wash over it. It also publishes
 * its own measured height as --fy-cta-h, which is what keeps the floating
 * search button and the page's bottom padding clear of it.
 */
export function StickyActionBar({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // Layout effect, not effect: the height has to be published before paint,
  // otherwise the first frame puts the search button on top of this bar.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--fy-cta-h', `${el.offsetHeight}px`);
    publish();
    // The bar grows when a fare appears in it, so its height is not fixed.
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(publish) : null;
    observer?.observe(el);
    return () => {
      observer?.disconnect();
      root.style.setProperty('--fy-cta-h', '0px');
    };
  }, []);

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 fy-above-nav z-40 bg-fy-bone/92 backdrop-blur-xl border-t border-fy-hairline/40"
    >
      {/* `className` reaches the INNER row, which is the one a caller ever
          wants to restyle — a screen whose action needs the full width
          passes flex-col. */}
      <div className={`max-w-2xl mx-auto px-gutter py-3 flex items-center gap-2.5 ${className}`}>{children}</div>
    </div>
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
