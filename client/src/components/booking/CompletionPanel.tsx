'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';

interface MinimalBooking {
  _id: string;
  status: string;
  settlementHeld?: boolean;
}

/**
 * The customer's half of finishing a job.
 *
 * While the work is under way it shows the completion code — the customer
 * hands it to the worker when they are satisfied, and that completes the job
 * on the spot. If the worker finishes without it, this becomes the
 * "Confirm job done / Report a problem" card. A reported problem holds
 * payment to the worker until it is resolved.
 */
export function CompletionPanel({
  booking,
  code,
  autoConfirmHours,
  onChanged,
}: {
  booking: MinimalBooking;
  code: string | null;
  autoConfirmHours?: number | null;
  onChanged: (b: MinimalBooking) => void;
}) {
  const t = useTranslations('completion');
  const [reporting, setReporting] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (booking.status === 'in_progress' && code) {
    return (
      <div className="rounded-card bg-fy-card border border-fy-hairline/60 p-4 flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-body text-body font-semibold text-fy-ink">{t('codeTitle')}</p>
          <p className="font-body text-label text-fy-ink-soft mt-0.5">{t('codeBody')}</p>
        </div>
        <span
          aria-label={t('codeAria', { code: code.split('').join(' ') })}
          className="shrink-0 font-mono text-[28px] font-bold tracking-[0.3em] text-fy-brown bg-fy-brown/8 rounded-control px-3 py-1.5"
        >
          {code}
        </span>
      </div>
    );
  }

  if (booking.status !== 'awaiting_confirmation') return null;

  if (booking.settlementHeld) {
    return (
      <div role="status" className="rounded-card bg-fy-well border border-fy-hairline/60 p-4">
        <p className="font-body text-body font-semibold text-fy-ink">{t('heldTitle')}</p>
        <p className="font-body text-label text-fy-ink-soft mt-0.5">{t('heldBody')}</p>
      </div>
    );
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ booking: MinimalBooking }>(`/api/bookings/${booking._id}/confirm-completion`);
      onChanged(res.booking);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  async function report() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ booking: MinimalBooking }>(`/api/bookings/${booking._id}/report-problem`, { description });
      onChanged(res.booking);
      setReporting(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card bg-fy-lime-tint-1 border border-fy-green/20 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-full bg-fy-green text-fy-bone flex items-center justify-center shrink-0">
          <Icon name="task_alt" size={20} />
        </span>
        <div className="min-w-0">
          <p className="font-body text-body font-semibold text-fy-ink">{t('confirmTitle')}</p>
          <p className="font-body text-label text-fy-ink-soft mt-0.5">{t('confirmBody')}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-control bg-fy-error-bg text-fy-on-error-bg px-3 py-2 font-body text-label">
          {error}
        </p>
      )}

      {reporting ? (
        <div className="flex flex-col gap-2">
          <label className="font-body text-label font-semibold text-fy-ink" htmlFor="problem">
            {t('reportLabel')}
          </label>
          <textarea
            id="problem"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('reportPlaceholder')}
            className="rounded-control border border-fy-hairline bg-fy-card px-3 py-2 font-body text-body text-fy-ink"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setReporting(false)}
              className="min-h-[48px] rounded-control border border-fy-hairline bg-fy-card font-body text-label font-semibold text-fy-ink"
            >
              {t('back')}
            </button>
            <button
              type="button"
              disabled={busy || description.trim().length < 10}
              onClick={report}
              className="min-h-[48px] rounded-control bg-fy-brown text-fy-on-brown font-body text-label font-semibold disabled:opacity-50"
            >
              {t('reportSubmit')}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setReporting(true)}
            className="min-h-[48px] rounded-control border border-fy-hairline bg-fy-card font-body text-label font-semibold text-fy-ink"
          >
            {t('reportProblem')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={confirm}
            className="min-h-[48px] rounded-control bg-fy-green text-fy-bone font-body text-label font-semibold disabled:opacity-50"
          >
            {t('confirmDone')}
          </button>
        </div>
      )}
      {autoConfirmHours ? (
        <p className="font-body text-label text-fy-ink-soft">{t('autoNote', { hours: autoConfirmHours })}</p>
      ) : null}
    </div>
  );
}
