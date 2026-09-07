'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Booking } from '@/lib/types';
import { ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { Panel, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button } from '@/components/fy/Controls';

/* Built against the "Nearby Ledger Holds" rows on
   client/public/design/worker_requests_queue.html.

   Anatomy there: a tinted glyph tile for the cargo type, the route as
   origin → destination, a meta line of tonnage and distance, an optional
   "heavy axle" style tag, the fare, and a review/claim action.

   Deliberately no countdown, unlike OfferCard: several eligible workers can
   see the same open request at once until one accepts, and the server's
   atomic accept decides the real winner. A timer here would be theatre. */

const typeGlyph: Record<string, string> = {
  truck: 'local_shipping',
  hamali: 'engineering',
  combo: 'inventory',
};

/** Category glyphs for the cargo a booking declares, matching the design's row icons. */
const goodsGlyph: Record<string, string> = {
  construction_material: 'foundation',
  industrial_machinery: 'precision_manufacturing',
  perishables: 'agriculture',
  furniture: 'chair',
  electronics: 'devices',
  household_shifting: 'home',
  documents_parcels: 'inventory_2',
  general_goods: 'category',
  other: 'more_horiz',
};

/** Above this the design tags the row as a heavy-axle load. Matches bucketVehicleCategory's large-vehicle floor. */
const HEAVY_AXLE_KG = 5000;

interface RequestCardProps {
  booking: Booking;
  accent?: 'primary' | 'secondary';
  onAccept: (bookingId: string) => Promise<void>;
  onReject: (bookingId: string) => Promise<void>;
  /** For a hamali/combo booking, shows "X of Y workers still needed". */
  hamaliSlotsNote?: string;
}

export function RequestCard({ booking, accent = 'primary', onAccept, onReject, hamaliSlotsNote }: RequestCardProps) {
  const t = useTranslations('workerRequests');
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);
  // An accept/reject failure (lost the race to another worker, went offline
  // mid-request, the mandatory-rating gate) used to throw straight into the
  // console as an unhandled rejection with no feedback: the button just
  // silently stopped working. Caught here, where driver and hamali share it.
  const [error, setError] = useState<string | null>(null);

  const weightKg = booking.cargoDetails?.weightKg ?? 0;
  const goodsType = booking.cargoDetails?.goodsType;
  const glyph = goodsType ? (goodsGlyph[goodsType] ?? typeGlyph[booking.type]) : typeGlyph[booking.type];
  const heavy = weightKg >= HEAVY_AXLE_KG;

  const meta: string[] = [];
  if (weightKg) meta.push(t('tonnes', { t: (weightKg / 1000).toFixed(weightKg < 1000 ? 2 : 1) }));
  if (goodsType) meta.push(t(`goodsTypes.${goodsType}` as never) ?? goodsType);
  if (booking.distanceKm > 0) meta.push(t('distanceTrip', { km: booking.distanceKm.toFixed(1) }));

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
    <Panel className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <IconTile tone={accent === 'primary' ? 'peach' : 'lime'} size="md">
            <Icon name={glyph} size={20} />
          </IconTile>
          <div className="min-w-0">
            <p className="font-body text-body font-semibold text-fy-ink truncate">
              {booking.pickupLocation.address.split(',')[0]} → {booking.dropLocation.address.split(',')[0]}
            </p>
            {meta.length > 0 && <Body size="label">{meta.join(' · ')}</Body>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-heading text-title text-fy-ink">₹{booking.fareBreakdown.total}</p>
          {heavy && <EyebrowLabel tone="brown">{t('heavyAxle')}</EyebrowLabel>}
        </div>
      </div>

      {hamaliSlotsNote && <StatusPill tone="outline">{hamaliSlotsNote}</StatusPill>}

      {error && (
        <div role="alert" className="rounded-control bg-fy-error-bg px-3.5 py-2.5 font-body text-label text-fy-on-error-bg">
          {error}
        </div>
      )}

      <Divider />

      <div className="flex gap-3">
        <Button variant="ghost" size="md" className="flex-1" disabled={pending !== null} onClick={() => handle('reject')}>
          {pending === 'reject' ? t('rejecting') : t('reject')}
        </Button>
        <Button
          variant={accent === 'primary' ? 'brown' : 'green'}
          size="md"
          glyph="check_circle"
          className="flex-1"
          disabled={pending !== null}
          onClick={() => handle('accept')}
        >
          {pending === 'accept' ? t('accepting') : t('accept')}
        </Button>
      </div>
    </Panel>
  );
}
