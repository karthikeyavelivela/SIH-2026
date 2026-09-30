'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';

interface EShram {
  registered: boolean;
  uanMasked?: string;
  hasCard: boolean;
}

export interface PoliceVerification {
  _id: string;
  status: 'pending' | 'verified' | 'rejected';
  referenceNumber?: string;
  rejectionReason?: string;
  expiresAt?: string;
  validNow: boolean;
  daysLeft?: number;
  expired: boolean;
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

const box = 'mt-3 rounded-control border border-fy-muted/20 px-3 py-2.5 flex flex-col gap-2';
const inputClass = 'rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm';
const link = 'self-start text-xs font-semibold text-fy-green hover:underline disabled:opacity-50';

/** e-Shram: the worker's own number, and optionally a photo of the card. Recorded, never checked against the portal. */
export function EShramCard() {
  const t = useTranslations('credentials');
  const [state, setState] = useState<EShram | null>(null);
  const [uan, setUan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<EShram>('/api/eshram').then(setState).catch(() => setState(null));
  }, []);

  async function run(fn: () => Promise<EShram>) {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  return (
    <div className={box}>
      <p className="text-xs font-semibold text-fy-brown">{t('eshramTitle')}</p>
      <p className="text-xs text-fy-muted">{t('eshramNote')}</p>
      {state.registered && <p className="text-xs text-fy-ink">{t('eshramSaved', { uan: state.uanMasked ?? '' })}</p>}
      <input
        inputMode="numeric"
        maxLength={12}
        value={uan}
        onChange={(e) => setUan(e.target.value.replace(/\D/g, ''))}
        placeholder={t('eshramPlaceholder')}
        aria-label={t('eshramPlaceholder')}
        className={inputClass}
      />
      <button type="button" className={link} disabled={busy || uan.length !== 12} onClick={() => void run(async () => { const r = await api.put<EShram>('/api/eshram', { uan }); setUan(''); return r; })}>
        {t('eshramSave')}
      </button>
      {state.registered && (
        <label className="text-xs text-fy-ink flex flex-col gap-1">
          {state.hasCard ? t('eshramCardHave') : t('eshramCard')}
          <input
            type="file"
            accept="image/*,application/pdf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(async () => api.post<EShram>('/api/eshram/card', { fileBase64: await toDataUrl(f) }));
            }}
          />
        </label>
      )}
      {error && <p role="alert" className="text-xs text-fy-error">{error}</p>}
    </div>
  );
}

/** Police verification: the worker's submission, its state, and the badge while it is valid. */
export function PoliceVerificationCard() {
  const t = useTranslations('credentials');
  const locale = useLocale();
  const [items, setItems] = useState<PoliceVerification[] | null>(null);
  const [reference, setReference] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => api.get<{ verifications: PoliceVerification[] }>('/api/police-verification').then((r) => setItems(r.verifications)).catch(() => setItems(null)), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/police-verification', { referenceNumber: reference, ...(file ? { fileBase64: await toDataUrl(file) } : {}) });
      setReference('');
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!items) return null;
  const latest = items[0];
  const current = items.find((i) => i.validNow);
  const pending = items.some((i) => i.status === 'pending');
  const date = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale) : '');

  return (
    <div className={box}>
      <p className="text-xs font-semibold text-fy-brown">{t('policeTitle')}</p>
      {current ? (
        <p className="text-xs font-semibold text-fy-green">{t('policeVerified', { date: date(current.expiresAt), days: current.daysLeft ?? 0 })}</p>
      ) : latest?.status === 'pending' ? (
        <p className="text-xs text-fy-ink">{t('policePending')}</p>
      ) : latest?.status === 'rejected' ? (
        <p className="text-xs text-fy-error">{t('policeRejected', { reason: latest.rejectionReason ?? '' })}</p>
      ) : latest?.expired ? (
        <p className="text-xs text-fy-error">{t('policeExpired')}</p>
      ) : (
        <p className="text-xs text-fy-muted">{t('policeNote')}</p>
      )}
      {!pending && (
        <>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('policeReference')} aria-label={t('policeReference')} className={inputClass} maxLength={60} />
          <label className="text-xs text-fy-ink flex flex-col gap-1">
            {t('policeFile')}
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className={link} disabled={busy || (!file && !reference.trim())} onClick={() => void submit()}>
            {t('policeSubmit')}
          </button>
        </>
      )}
      {error && <p role="alert" className="text-xs text-fy-error">{error}</p>}
    </div>
  );
}

export function WorkerCredentialsSection() {
  return (
    <>
      <EShramCard />
      <PoliceVerificationCard />
    </>
  );
}
