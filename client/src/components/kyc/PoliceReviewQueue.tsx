'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';

interface Row {
  _id: string;
  workerName: string;
  referenceNumber?: string;
  hasFile: boolean;
  createdAt: string;
}

/**
 * The police verifications waiting for this person to check: a society
 * leader sees their own members', an admin or a manager with verify_kyc sees
 * everyone's. Approving gives twelve months; rejecting needs a reason.
 */
export function PoliceReviewQueue() {
  const t = useTranslations('credentials');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.get<{ queue: Row[] }>('/api/police-verification/queue').then((r) => setRows(r.queue)).catch(() => setRows([])), []);
  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'verified' | 'rejected') {
    setBusy(true);
    setError(null);
    try {
      await api.patch(`/api/police-verification/${id}`, { decision, ...(decision === 'rejected' ? { reason } : {}) });
      setReasonFor(null);
      setReason('');
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  async function view(id: string) {
    try {
      const r = await api.get<{ url: string }>(`/api/police-verification/${id}/url`);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('failed'));
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-lg text-fy-ink">{t('reviewTitle')}</h2>
      {rows === null ? null : rows.length === 0 ? (
        <p className="text-sm text-fy-muted">{t('reviewNone')}</p>
      ) : (
        rows.map((r) => (
          <div key={r._id} className="rounded-card border border-fy-muted/20 p-3 flex flex-col gap-2">
            <p className="text-sm font-semibold text-fy-ink">{r.workerName}</p>
            {r.referenceNumber && <p className="text-xs text-fy-muted">{t('reviewReference', { ref: r.referenceNumber })}</p>}
            {r.hasFile && (
              <button type="button" className="self-start text-xs font-semibold text-fy-green hover:underline" onClick={() => void view(r._id)}>
                {t('reviewView')}
              </button>
            )}
            {reasonFor === r._id ? (
              <div className="flex flex-col gap-2">
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('reviewReason')} aria-label={t('reviewReason')} maxLength={300} className="rounded-control border border-fy-muted/20 bg-fy-bone px-3 py-2 text-sm" />
                <button type="button" disabled={busy || !reason.trim()} className="self-start text-xs font-semibold text-fy-error hover:underline disabled:opacity-50" onClick={() => void decide(r._id, 'rejected')}>
                  {t('reviewReject')}
                </button>
              </div>
            ) : (
              <div className="flex gap-4">
                <button type="button" disabled={busy} className="text-xs font-semibold text-fy-green hover:underline disabled:opacity-50" onClick={() => void decide(r._id, 'verified')}>
                  {t('reviewApprove')}
                </button>
                <button type="button" disabled={busy} className="text-xs font-semibold text-fy-error hover:underline" onClick={() => setReasonFor(r._id)}>
                  {t('reviewReject')}
                </button>
              </div>
            )}
          </div>
        ))
      )}
      {error && <p role="alert" className="text-xs text-fy-error">{error}</p>}
    </section>
  );
}
