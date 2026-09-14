'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { LightCard, Panel } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { Button, Field } from '@/components/fy/Controls';

/**
 * The claim end of the workmanship guarantee.
 *
 * The badge advertising this guarantee has been on the customer dashboard
 * for a long time with nothing behind it. This is the part that makes the
 * promise collectable — and it deliberately renders the unhappy states too:
 * "the window closed" and "already claimed" are answers, while showing
 * nothing at all is how a customer ends up believing the guarantee was never
 * real.
 */

interface GuaranteeStatus {
  eligible: boolean;
  periodDays?: number;
  expiresAt?: string;
  daysLeft?: number;
  claimedComplaintId?: string;
  reason?: 'not_completed' | 'category_not_eligible' | 'window_expired' | 'already_claimed';
}

export function GuaranteeSection({ bookingId, status }: { bookingId: string; status: string }) {
  const t = useTranslations('guarantee');
  const [guarantee, setGuarantee] = useState<GuaranteeStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only a finished job can have a guarantee window, so there is nothing to
    // ask about before then.
    if (status !== 'completed') return;
    api
      .get<{ guarantee: GuaranteeStatus }>(`/api/bookings/${bookingId}/guarantee`)
      .then((res) => setGuarantee(res.guarantee))
      .catch(() => {});
  }, [bookingId, status]);

  if (!guarantee) return null;
  // A category with no guarantee says nothing rather than explaining an
  // absence nobody asked about.
  if (guarantee.reason === 'category_not_eligible' || guarantee.reason === 'not_completed') return null;

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/bookings/${bookingId}/guarantee-claim`, { description: description.trim() });
      setSent(true);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
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

      {sent ? (
        <Body size="label">{t('sent')}</Body>
      ) : guarantee.claimedComplaintId ? (
        <Body size="label">{t('claimed')}</Body>
      ) : guarantee.reason === 'window_expired' ? (
        <Body size="label">{t('expired')}</Body>
      ) : (
        <>
          <Body size="label">{t('daysLeft', { days: guarantee.daysLeft ?? 0 })}</Body>
          {open ? (
            <div className="flex flex-col gap-2">
              <Field
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('placeholder')}
              />
              <Button
                size="md"
                glyph="verified_user"
                disabled={busy || description.trim().length < 10}
                onClick={claim}
              >
                {busy ? t('claiming') : t('claim')}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="md" glyph="verified_user" onClick={() => setOpen(true)}>
              {t('claim')}
            </Button>
          )}
        </>
      )}

      {error && <LightCard><Body size="label">{error}</Body></LightCard>}
    </Panel>
  );
}
