'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IncomingOffer } from '@/lib/useIncomingOffer';
import { Icon } from '@/components/ui/Icon';
import { CountdownRing } from '@/components/ui/CountdownRing';
import { Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button } from '@/components/fy/Controls';

/* Built against client/public/design/worker_incoming_offer.html and the
   LIVE MANDATE card at the top of worker_requests_queue.html.

   Anatomy there: a dark accent plate with a "LIVE MANDATE" eyebrow and a
   live countdown, the guaranteed payout as the largest figure, the payload
   line, pickup and destination with distances, a note that the exact
   facility stays hidden until the offer is secured, and a two-button row —
   pass, or claim.

   The design also prints a "Match 98.4%" score and a fixed 94%
   net-to-passbook figure. The matching engine ranks candidates but exposes
   no score, and a worker's deduction comes from their society's own
   commission and welfare rates rather than a platform-wide 94%, so neither
   is invented here — the payout shown is the real fare, labelled as the
   job's fare rather than as take-home. */

const typeGlyph: Record<string, string> = {
  truck: 'local_shipping',
  hamali: 'engineering',
  combo: 'inventory',
};

interface OfferCardProps {
  offer: IncomingOffer;
  accent?: 'primary' | 'secondary';
  responding: boolean;
  onAccept: () => void;
  onReject: () => void;
  /** Overrides the accept label — the society leader flow opens a member picker instead of settling instantly. */
  acceptLabel?: string;
}

/** Matches the server's OFFER_TIMEOUT_MS. Visual only; the server is authoritative on the real expiry. */
const TOTAL_SECONDS = 20;

export function OfferCard({ offer, accent = 'primary', responding, onAccept, onReject, acceptLabel }: OfferCardProps) {
  const t = useTranslations('offerCard');
  const [msLeft, setMsLeft] = useState(() => Math.max(0, offer.expiresAt - Date.now()));

  useEffect(() => {
    const id = setInterval(() => setMsLeft(Math.max(0, offer.expiresAt - Date.now())), 250);
    return () => clearInterval(id);
  }, [offer.expiresAt]);

  const secondsLeft = Math.ceil(msLeft / 1000);
  const glyph = typeGlyph[offer.type] ?? 'local_shipping';
  const dark = accent === 'primary' ? 'bg-fy-brown' : 'bg-fy-green';

  // The payload line, built only from fields the booking really carries.
  const payloadBits: string[] = [];
  if (offer.weightKg) payloadBits.push(t('tonnes', { t: (offer.weightKg / 1000).toFixed(offer.weightKg < 1000 ? 2 : 1) }));
  if (offer.goodsType) payloadBits.push(t(`goodsTypes.${offer.goodsType}` as never) ?? offer.goodsType);
  if (offer.hamaliCount) payloadBits.push(t('crew', { count: offer.hamaliCount }));

  return (
    <div
      className={`${dark} text-fy-bone rounded-sheet p-5 shadow-float flex flex-col gap-3 animate-[scaleIn_250ms_ease-out]`}
      role="region"
      aria-label={t('newJobTitle')}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2 min-w-0">
          <IconTile tone={accent === 'primary' ? 'peach' : 'lime'} size="sm">
            <Icon name={glyph} size={18} />
          </IconTile>
          <span className="min-w-0">
            <EyebrowLabel tone="lime">{t('liveMandate')}</EyebrowLabel>
            <p className="font-body text-label text-fy-bone/80">{t('secondsToDecide', { seconds: secondsLeft })}</p>
          </span>
        </span>
        <CountdownRing secondsLeft={secondsLeft} totalSeconds={TOTAL_SECONDS} size={44} accent={accent}>
          <span className="font-body text-label font-bold text-fy-bone">{secondsLeft}</span>
        </CountdownRing>
      </div>

      <div>
        <EyebrowLabel tone="on-dark" className="opacity-70">
          {t('guaranteedFare')}
        </EyebrowLabel>
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-metric text-fy-lime leading-none">₹{offer.total}</span>
          <StatusPill tone="lime">{t('coopProtected')}</StatusPill>
        </div>
        {payloadBits.length > 0 && (
          <Body tone="on-dark" size="label" className="mt-1 opacity-85">
            {payloadBits.join(' · ')}
          </Body>
        )}
      </div>

      <Divider className="border-fy-bone/15" />

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2.5">
          <Icon name="trip_origin" size={16} className="text-fy-lime shrink-0 mt-0.5" />
          <div className="min-w-0">
            <EyebrowLabel tone="on-dark" className="opacity-70">
              {t('pickup')}
            </EyebrowLabel>
            <p className="font-body text-label text-fy-bone truncate">{offer.pickupAddress}</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <Icon name="location_on" size={16} className="text-fy-bone/70 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <EyebrowLabel tone="on-dark" className="opacity-70">
              {offer.distanceKm > 0 ? t('destinationWithKm', { km: offer.distanceKm.toFixed(1) }) : t('destination')}
            </EyebrowLabel>
            <p className="font-body text-label text-fy-bone truncate">{offer.dropAddress}</p>
          </div>
        </div>
      </div>

      <span className="flex items-center gap-1.5 text-fy-bone/70">
        <Icon name="lock" size={14} />
        <span className="font-body text-eyebrow uppercase">{t('facilityHidden')}</span>
      </span>

      <div className="flex gap-3 pt-1">
        <Button variant="light" className="flex-1" disabled={responding} onClick={onReject}>
          {t('decline')}
        </Button>
        <Button variant="lime" className="flex-1" disabled={responding} onClick={onAccept}>
          {responding ? t('sending') : (acceptLabel ?? t('accept'))}
        </Button>
      </div>
    </div>
  );
}
