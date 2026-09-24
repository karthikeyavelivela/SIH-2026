'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';

/**
 * What a role area shows until it knows who is looking.
 *
 * A spinner while the session is being checked (including the retries that
 * cover the API waking up), and — if it still could not be checked — a
 * plain sentence and a retry button. Never a redirect: failing to reach the
 * server is not evidence that someone is signed out.
 */
export function SessionGate() {
  const t = useTranslations('session');
  const { error, refetch, loading } = useAuth();
  const [retrying, setRetrying] = useState(false);

  if (error && !loading && !retrying) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-gutter text-center bg-fy-bone">
        <p className="font-body text-body text-fy-ink max-w-xs">{t('unreachable')}</p>
        <button
          type="button"
          onClick={async () => {
            setRetrying(true);
            try {
              await refetch();
            } finally {
              setRetrying(false);
            }
          }}
          className="min-h-[44px] px-5 rounded-full bg-fy-brown text-fy-on-brown font-body text-label font-semibold"
        >
          {t('retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-fy-ink-soft bg-fy-bone">
      <div className="w-8 h-8 rounded-full border-2 border-fy-hairline border-t-fy-brown animate-spin" aria-hidden="true" />
      <p className="text-sm">{t('checking')}</p>
    </div>
  );
}
