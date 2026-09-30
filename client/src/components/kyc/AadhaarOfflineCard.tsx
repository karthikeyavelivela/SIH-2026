'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';

interface Status {
  enabled: boolean;
  ready?: boolean;
  verified: boolean;
  last4?: string;
  nameMatch?: 'match' | 'partial' | 'mismatch' | 'not_compared';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/**
 * P4.1 — Aadhaar Paperless Offline e-KYC. The zip and the share code are sent
 * once and kept nowhere; only the outcome comes back. When the server has it
 * switched off (or not set up) this says so and points to the photo upload,
 * rather than showing a form that cannot work.
 */
export function AadhaarOfflineCard() {
  const t = useTranslations('offlineKyc');
  const [status, setStatus] = useState<Status | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Status>('/api/kyc/documents/aadhaar-offline').then(setStatus).catch(() => setStatus(null));
  }, []);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<Status>('/api/kyc/documents/aadhaar-offline', { fileBase64: await readAsDataUrl(file), shareCode: code });
      setStatus(res);
      setFile(null);
      setCode('');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!status) return null;

  return (
    <div className="mt-1.5 ml-1 rounded-control border border-fy-muted/20 px-3 py-2.5 flex flex-col gap-2">
      <p className="text-xs font-semibold text-fy-brown">{t('title')}</p>
      {status.verified ? (
        <p className="text-xs text-fy-ink">
          {t('done', { last4: status.last4 ?? '' })} {status.nameMatch ? t(`match_${status.nameMatch}`) : ''}
        </p>
      ) : !status.enabled ? (
        <p className="text-xs text-fy-muted">{t('off')}</p>
      ) : !status.ready ? (
        <p className="text-xs text-fy-muted">{t('notReady')}</p>
      ) : (
        <>
          <p className="text-xs text-fy-muted">{t('intro')}</p>
          <label className="flex flex-col gap-1 text-xs text-fy-ink">
            {t('fileLabel')}
            <input type="file" accept=".zip,application/zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fy-ink">
            {t('shareCodeLabel')}
            <input
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || !file || code.length === 0}
            onClick={submit}
            className="self-start text-xs font-semibold text-fy-green hover:underline disabled:opacity-50"
          >
            {busy ? t('verifying') : t('submit')}
          </button>
          {error && <p role="alert" className="text-xs text-fy-error">{error}</p>}
        </>
      )}
    </div>
  );
}
