'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ComponentType } from 'react';

export interface TabItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface BottomTabNavProps {
  items: TabItem[];
}

// Every layout that renders this nav (customer/driver/hamali/mutha/
// mutha-member) still hardcodes its TabItem[] with an English `label` —
// they haven't been converted to next-intl yet (see client/src/i18n/README.md).
// Rather than touch all five of those layout files in this pass, this map
// translates the known English label strings to the shared `nav` message
// namespace; any label not in the map (e.g. a future new tab) just renders
// as-is, so this degrades safely instead of breaking.
const LABEL_TO_KEY: Record<string, string> = {
  Home: 'home',
  Book: 'book',
  History: 'history',
  Profile: 'profile',
  Requests: 'requests',
  Earnings: 'earnings',
  Group: 'group',
  Jobs: 'jobs',
  Members: 'members',
  Job: 'job',
};

// Fixed bottom nav for authenticated mobile screens — required by the spec
// for every authenticated role. Kept visible at all breakpoints (a bottom
// tab bar reading as "the" navigation on desktop too is a defensible
// low-risk choice for an app whose primary usage is mobile; a desktop-only
// alternate chrome can replace this later without touching the pages that
// consume it, since they only render inside the layout that places this).
export function BottomTabNav({ items }: BottomTabNavProps) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface-raised border-t border-border shadow-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg mx-auto grid grid-flow-col auto-cols-fr">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          const key = LABEL_TO_KEY[item.label];
          const label = key ? t(key) : item.label;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors duration-fast ${
                active ? 'text-primary-600' : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <item.icon className="w-[22px] h-[22px]" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
