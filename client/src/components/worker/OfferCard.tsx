'use client';

import { useEffect, useState } from 'react';
import { IncomingOffer } from '@/lib/useIncomingOffer';
import { Button } from '@/components/ui/Button';
import { TruckIcon, BoxIcon, LayersIcon, MapPinIcon } from '@/components/ui/icons';

const typeIcon = { truck: TruckIcon, hamali: BoxIcon, combo: LayersIcon };

interface OfferCardProps {
  offer: IncomingOffer;
  accent?: 'primary' | 'secondary';
  responding: boolean;
  onAccept: () => void;
  onReject: () => void;
  /** Overrides the accept button label — used by the Mutha leader flow ("Accept & assign" opens the member picker instead of settling instantly). */
  acceptLabel?: string;
}

// The pushed, exclusive, timed offer — visually distinct from a plain
// RequestCard (glowing accent border + live countdown ring) since only
// THIS worker can act on it right now, unlike the browse list below it.
export function OfferCard({ offer, accent = 'primary', responding, onAccept, onReject, acceptLabel }: OfferCardProps) {
  const [msLeft, setMsLeft] = useState(() => Math.max(0, offer.expiresAt - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setMsLeft(Math.max(0, offer.expiresAt - Date.now()));
    }, 250);
    return () => clearInterval(id);
  }, [offer.expiresAt]);

  const secondsLeft = Math.ceil(msLeft / 1000);
  const totalSeconds = 20; // matches server's OFFER_TIMEOUT_MS default; purely visual, server is authoritative on the real expiry
  const pct = Math.max(0, Math.min(1, msLeft / (totalSeconds * 1000)));
  const Icon = typeIcon[offer.type as keyof typeof typeIcon] ?? TruckIcon;
  const ringColor = accent === 'primary' ? '#BF5020' : '#0A6F66';
  const accentText = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';
  const accentBg = accent === 'primary' ? 'bg-primary/10' : 'bg-secondary/10';

  return (
    <div
      className="relative rounded-lg bg-surface-raised border-2 p-5 shadow-lg animate-[scaleIn_250ms_ease-out]"
      style={{ borderColor: ringColor }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${accentBg} ${accentText}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-heading font-bold text-base">New job — just for you</p>
            {offer.distanceKm > 0 && <p className="text-xs text-text-muted">{offer.distanceKm.toFixed(1)} km trip</p>}
          </div>
        </div>
        <div className="relative w-11 h-11 flex-shrink-0">
          <svg viewBox="0 0 40 40" className="w-11 h-11 -rotate-90">
            <circle cx="20" cy="20" r="17" fill="none" stroke="var(--color-border)" strokeWidth="4" />
            <circle
              cx="20"
              cy="20"
              r="17"
              fill="none"
              stroke={ringColor}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 17}
              strokeDashoffset={2 * Math.PI * 17 * (1 - pct)}
              style={{ transition: 'stroke-dashoffset 250ms linear' }}
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{secondsLeft}</span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-start gap-2.5">
          <MapPinIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${accentText}`} />
          <p className="text-sm truncate">{offer.pickupAddress}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-muted" />
          <p className="text-sm text-text-muted truncate">{offer.dropAddress}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-text-muted">Fare</span>
        <p className="font-heading font-bold text-lg">₹{offer.total}</p>
      </div>

      <div className="flex gap-3">
        <Button variant="ghost" className="flex-1" disabled={responding} onClick={onReject}>
          Decline
        </Button>
        <Button
          variant={accent === 'primary' ? 'primary' : 'secondary'}
          className="flex-1"
          disabled={responding}
          onClick={onAccept}
        >
          {responding ? 'Sending…' : acceptLabel ?? 'Accept'}
        </Button>
      </div>
    </div>
  );
}
