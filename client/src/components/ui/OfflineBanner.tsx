'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

// Phase 5.4 — before this, a lost connection was silent: forms would just
// fail with a generic error, and usePolling's fetches would quietly stop
// updating with no indication why. Mounted once in the root layout so it
// covers every role. navigator.onLine + the online/offline events is the
// real signal (not a guess) — it reflects the OS/browser's own network
// state, not a heuristic on failed requests.
export function OfflineBanner() {
  const t = useTranslations('offline');
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-0 inset-x-0 z-[100] bg-ip-inverse-surface text-ip-inverse-on-surface px-4 py-2.5 text-sm text-center shadow-lg"
    >
      <span className="font-semibold">{t('offline')}</span> — {t('offlineDesc')}
    </div>
  );
}
