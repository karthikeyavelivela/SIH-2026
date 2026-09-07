'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

interface TopBarProps {
  title: string;
  /** Small uppercase line above the title — "FYRO Cooperative" on most screens. */
  eyebrow?: ReactNode;
  onBack?: () => void;
  /** Pass false to hide the back arrow entirely (top-level screens). */
  showBack?: boolean;
  right?: ReactNode;
  className?: string;
}

/**
 * Page header for the screens that have not been rebuilt onto fy/Navigation's
 * TopBar yet. Same anatomy as that one — 64px tall, bone at 88% under a
 * blur, an optional eyebrow over a serif title, an action slot on the right —
 * so a mixed screen never shows two different headers.
 *
 * Sticky rather than fixed, because these pages lay their content out in
 * normal flow and do not reserve a 64px offset for it.
 */
export function TopBar({ title, eyebrow, onBack, showBack = true, right, className = '' }: TopBarProps) {
  const router = useRouter();
  return (
    <header
      className={`sticky top-0 z-30 bg-fy-bone/88 backdrop-blur-xl shadow-[0_1px_8px_rgba(28,28,22,0.03)] ${className}`}
    >
      <div className="h-16 max-w-2xl mx-auto px-gutter flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {showBack && (
            <button
              type="button"
              onClick={onBack ?? (() => router.back())}
              aria-label="Go back"
              className="w-11 h-11 -ml-2 shrink-0 flex items-center justify-center rounded-full text-fy-ink hover:bg-fy-field transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <div className="flex flex-col min-w-0">
            {eyebrow && (
              <span className="font-body text-eyebrow uppercase text-fy-muted leading-none">{eyebrow}</span>
            )}
            <h1 className="font-heading text-title text-fy-ink leading-tight truncate">{title}</h1>
          </div>
        </div>
        {right && <div className="shrink-0 flex items-center gap-1">{right}</div>}
      </div>
    </header>
  );
}
