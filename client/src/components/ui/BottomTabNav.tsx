'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ComponentType } from 'react';

export interface TabItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

interface BottomTabNavProps {
  items: TabItem[];
}

// Fixed bottom nav for authenticated mobile screens — required by the spec
// for every authenticated role. Kept visible at all breakpoints (a bottom
// tab bar reading as "the" navigation on desktop too is a defensible
// low-risk choice for an app whose primary usage is mobile; a desktop-only
// alternate chrome can replace this later without touching the pages that
// consume it, since they only render inside the layout that places this).
export function BottomTabNav({ items }: BottomTabNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 bg-surface-raised border-t border-border shadow-lg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="max-w-lg mx-auto grid grid-flow-col auto-cols-fr">
        {items.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
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
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
