'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { EmptyState } from './EmptyState';
import { Button } from './Button';
import { AlertIcon } from './icons';

interface ErrorBoundaryContentProps {
  error: Error & { digest?: string };
  reset: () => void;
  /** Where "go to dashboard" points — the signed-in role's own home. Omit on pages with no role home (marketing/auth). */
  homeHref?: string;
  className?: string;
}

// Shared content for every route group's error.tsx (Phase 5.3 — before this,
// an unhandled render error anywhere in the app fell through to Next.js's
// default, unbranded, English-only error screen with no retry affordance).
// Each role's own error.tsx renders this INSIDE that role's layout — the
// sidebar/bottom-nav stays visible, only the content area shows the error,
// per Next.js's error-boundary nesting (an error.tsx catches errors from
// its own segment's page, not from its parent layout).
export function ErrorBoundaryContent({ error, reset, homeHref, className = '' }: ErrorBoundaryContentProps) {
  const t = useTranslations('errorBoundary');

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[FYRO] Route error boundary caught:', error);
  }, [error]);

  return (
    <div className={`max-w-lg mx-auto px-5 pt-6 ${className}`}>
      <EmptyState
        icon={<AlertIcon className="w-7 h-7" />}
        title={t('title')}
        description={t('description')}
        action={
          <div className="flex items-center gap-3">
            <Button onClick={reset}>{t('tryAgain')}</Button>
            {homeHref && (
              <Link href={homeHref} className="text-sm font-semibold text-ip-primary hover:underline">
                {t('goHome')}
              </Link>
            )}
          </div>
        }
      />
    </div>
  );
}
