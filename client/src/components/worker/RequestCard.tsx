'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Booking } from '@/lib/types';
import { ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { TruckIcon, BoxIcon, LayersIcon, MapPinIcon, AlertIcon } from '@/components/ui/icons';

const typeIcon = { truck: TruckIcon, hamali: BoxIcon, combo: LayersIcon };

interface RequestCardProps {
  booking: Booking;
  accent?: 'primary' | 'secondary';
  onAccept: (bookingId: string) => Promise<void>;
  onReject: (bookingId: string) => Promise<void>;
  /** For a hamali/combo booking, shows "X of Y workers still needed". */
  hamaliSlotsNote?: string;
}

// Shared by driver and hamali_solo /requests feeds — Phase 2 is polling,
// not sockets, so this deliberately has no fake countdown timer: several
// eligible workers can see the same open request simultaneously until one
// of them accepts (server-side atomic accept decides the real winner).
export function RequestCard({ booking, accent = 'primary', onAccept, onReject, hamaliSlotsNote }: RequestCardProps) {
  const t = useTranslations('workerRequests');
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);
  // Was previously unhandled — an accept/reject failure (lost the race to
  // another worker, went offline mid-request, the mandatory-rating gate)
  // threw straight into the console as an unhandled rejection with no
  // feedback at all: the button just silently stopped working. Caught here
  // now, at the one place both driver and hamali_solo /requests share it.
  const [error, setError] = useState<string | null>(null);
  const Icon = typeIcon[booking.type];
  const accentText = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';
  const accentBg = accent === 'primary' ? 'bg-primary/10' : 'bg-secondary/10';

  async function handle(action: 'accept' | 'reject') {
    setPending(action);
    setError(null);
    try {
      await (action === 'accept' ? onAccept(booking._id) : onReject(booking._id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="rounded-lg bg-surface-raised border border-border shadow-md p-5 animate-[scaleIn_250ms_ease-out]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${accentBg} ${accentText}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-heading font-bold text-base capitalize">{booking.type} {t('job')}</p>
            {booking.distanceKm > 0 && <p className="text-xs text-text-muted">{t('distanceTrip', { km: booking.distanceKm.toFixed(1) })}</p>}
          </div>
        </div>
        <p className="font-heading font-bold text-lg whitespace-nowrap">₹{booking.fareBreakdown.total}</p>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex items-start gap-2.5">
          <MapPinIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${accentText}`} />
          <p className="text-sm truncate">{booking.pickupLocation.address}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-muted" />
          <p className="text-sm text-text-muted truncate">{booking.dropLocation.address}</p>
        </div>
      </div>

      {hamaliSlotsNote && <p className="text-xs text-text-muted mb-4">{hamaliSlotsNote}</p>}

      {error && (
        <div role="alert" className="flex items-start gap-2 mb-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          <AlertIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex gap-3">
        <Button
          variant="ghost"
          className="flex-1"
          disabled={pending !== null}
          onClick={() => handle('reject')}
        >
          {pending === 'reject' ? t('rejecting') : t('reject')}
        </Button>
        <Button
          variant={accent === 'primary' ? 'primary' : 'secondary'}
          className="flex-1"
          disabled={pending !== null}
          onClick={() => handle('accept')}
        >
          {pending === 'accept' ? t('accepting') : t('accept')}
        </Button>
      </div>
    </div>
  );
}
