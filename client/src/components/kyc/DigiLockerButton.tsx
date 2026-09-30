'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';

/**
 * "Fetch from DigiLocker" for a PAN card or a driving licence. Shown as a
 * working button only when the server says it is ready; otherwise it says it is
 * not switched on and leaves the ordinary upload as the way. Tapping it sends
 * the person to DigiLocker's own sign-in (the address comes from the server).
 */
export function DigiLockerButton({ docType }: { docType: 'pan' | 'driving_licence' }) {
  const t = useTranslations('digilocker');
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ ready: boolean }>('/api/digilocker/status').then((r) => setReady(r.ready)).catch(() => setReady(false));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ authorizeUrl: string }>('/api/digilocker/start', { docType });
      window.location.assign(r.authorizeUrl);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
      setBusy(false);
    }
  }

  if (ready === null) return null;
  return (
    <div className="mt-1.5 ml-1 flex flex-col gap-1">
      {ready ? (
        <>
          <button type="button" disabled={busy} onClick={() => void start()} className="self-start text-xs font-semibold text-fy-green hover:underline disabled:opacity-50">
            {busy ? t('starting') : t('fetch')}
          </button>
          <p className="text-xs text-fy-muted">{t('note')}</p>
        </>
      ) : (
        <p className="text-xs text-fy-muted">{t('off')}</p>
      )}
      {error && <p role="alert" className="text-xs text-fy-error">{error}</p>}
    </div>
  );
}
