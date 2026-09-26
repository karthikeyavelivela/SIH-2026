'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import type { Booking } from '@/lib/types';
import { Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';
import { Icon } from '@/components/ui/Icon';

/**
 * P1.3 — shown on a guarantee re-work job. Says plainly who pays for what,
 * and lets the worker record the materials used (the only thing the
 * customer pays) before completing.
 */
export function ReworkPanel({ booking, onUpdated }: { booking: Booking; onUpdated: (b: Booking) => void }) {
  const t = useTranslations('rework');
  const [amount, setAmount] = useState(booking.materialsCost != null ? String(booking.materialsCost) : '');
  const [note, setNote] = useState(booking.materialsNote ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const editable = booking.status === 'accepted' || booking.status === 'in_progress';

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.post<{ booking: Booking }>(`/api/rework/${booking._id}/materials`, {
        amount: Number(amount) || 0,
        note: note.trim() || undefined,
      });
      onUpdated(res.booking);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="flex flex-col gap-3 border-l-[3px] border-l-fy-lime">
      <div className="flex items-center gap-2">
        <Icon name="verified_user" size={18} className="text-fy-green" />
        <EyebrowLabel tone="green">{t('title')}</EyebrowLabel>
      </div>
      <Body size="label">{t('explainer')}</Body>
      {editable ? (
        <div className="flex flex-col gap-2">
          <Field
            type="number"
            inputMode="decimal"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('materialsPlaceholder')}
            aria-label={t('materialsLabel')}
          />
          <Field value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePlaceholder')} aria-label={t('noteLabel')} />
          <Button size="md" glyph="receipt_long" disabled={busy} onClick={save}>
            {busy ? t('saving') : t('save')}
          </Button>
          {saved && <Body size="label">{t('saved', { amount: Number(amount) || 0 })}</Body>}
        </div>
      ) : (
        <Body size="label">{t('materialsFinal', { amount: booking.materialsCost ?? 0 })}</Body>
      )}
      {error && <Body size="label">{error}</Body>}
    </Panel>
  );
}
