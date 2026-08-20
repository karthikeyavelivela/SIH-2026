'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface TopBarProps {
  title: string;
  onBack?: () => void;
  /** Pass false to hide the back arrow entirely (top-level screens). */
  showBack?: boolean;
  right?: ReactNode;
  className?: string;
}

// Sticky page header for new industrial-style screens — back arrow, title,
// optional right-side action slot (filter icon, "Export" button, etc).
// Sibling to the existing BackHeader; this one carries the tonal-surface
// look and an optional right action rather than being back-arrow-only.
export function TopBar({ title, onBack, showBack = true, right, className = '' }: TopBarProps) {
  const router = useRouter();
  return (
    <header
      className={`sticky top-0 z-30 flex items-center justify-between gap-3 px-ip-edge py-4 bg-ip-surface/95 backdrop-blur-sm border-b border-ip-outline/10 ${className}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {showBack && (
          <button
            type="button"
            onClick={onBack ?? (() => router.back())}
            aria-label="Go back"
            className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-full text-ip-on-surface hover:bg-ip-surface-container transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <h1 className="font-heading font-bold text-ip-headline-sm truncate">{title}</h1>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </header>
  );
}
