'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Booking } from '@/lib/types';
import { ApiClientError } from '@/lib/api';
import { Icon } from '@/components/ui/Icon';
import { Panel, Divider, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { Button, Field } from '@/components/fy/Controls';

/* Built against the "Available hauls" rows on
   client/public/design/worker_load_board.html.

   Anatomy there: a lane title, the route, a meta line of tonnage, distance
   and a handling note, the customer's offer as the figure on the right, a
   line of timing and competing-bid count, and a Place Bid action.

   Distinct from RequestCard: that one is "accept at the fixed price", this
   one is always "propose your own". The reference fare is context, never a
   button to accept outright — bookingAssignment.service.ts 409s a flat-fare
   accept on a bidding load regardless of what the UI does. */

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

export interface LoadBoardBid {
  _id: string;
  amount: number;
  message?: string;
  status: string;
}

export type LoadBoardBooking = Booking & {
  myBid: LoadBoardBid | null;
  /** Pending bids from other members. A count only — never amounts or identities. */
  bidCount?: number;
  scheduledFor?: string;
};

interface LoadBoardCardProps {
  booking: LoadBoardBooking;
  accent?: 'primary' | 'secondary';
  onBid: (bookingId: string, amount: number, message?: string) => Promise<void>;
  onWithdraw: (bookingId: string, bidId: string) => Promise<void>;
}

export function LoadBoardCard({ booking, accent = 'primary', onBid, onWithdraw }: LoadBoardCardProps) {
  const t = useTranslations('loadBoard');
  const [amount, setAmount] = useState(booking.myBid ? String(booking.myBid.amount) : '');
  const [message, setMessage] = useState(booking.myBid?.message ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(Boolean(booking.myBid));

  const weightKg = booking.cargoDetails?.weightKg ?? 0;
  const goodsType = booking.cargoDetails?.goodsType;
  const glyph = goodsType ? (goodsGlyph[goodsType] ?? 'local_shipping') : 'local_shipping';

  const meta: string[] = [];
  if (weightKg) meta.push(t('tonnes', { t: (weightKg / 1000).toFixed(weightKg < 1000 ? 2 : 1) }));
  if (goodsType) meta.push(t(`goodsTypes.${goodsType}` as never) ?? goodsType);
  if (booking.distanceKm > 0) meta.push(t('distanceTrip', { km: booking.distanceKm.toFixed(1) }));

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return;
    setPending(true);
    setError(null);
    try {
      await onBid(booking._id, n, message.trim() || undefined);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorBid'));
    } finally {
      setPending(false);
    }
  }

  async function withdraw() {
    if (!booking.myBid) return;
    setPending(true);
    setError(null);
    try {
      await onWithdraw(booking._id, booking.myBid._id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorWithdraw'));
    } finally {
      setPending(false);
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
          <EyebrowLabel>{t('customerOffer')}</EyebrowLabel>
          <p className="font-heading text-title text-fy-ink">₹{booking.fareBreakdown.total}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {booking.scheduledFor && (
          <StatusPill tone="outline">
            {t('scheduledFor', { when: new Date(booking.scheduledFor).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) })}
          </StatusPill>
        )}
        {/* A count only — no amounts, so nobody can undercut a quote they read here. */}
        <StatusPill tone={booking.bidCount ? 'neutral' : 'outline'}>
          {t('competingBids', { count: booking.bidCount ?? 0 })}
        </StatusPill>
        {booking.myBid && <StatusPill tone="lime">{t('yourCurrentBid', { amount: booking.myBid.amount })}</StatusPill>}
      </div>

      {error && (
        <div role="alert" className="rounded-control bg-fy-error-bg px-3.5 py-2.5 font-body text-label text-fy-on-error-bg">
          {error}
        </div>
      )}

      <Divider />

      {!open ? (
        <Button
          variant={accent === 'primary' ? 'brown' : 'green'}
          size="md"
          glyph="gavel"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          {t('placeBid')}
        </Button>
      ) : (
        <div className="flex flex-col gap-2">
          <div>
            <EyebrowLabel>{t('yourBidLabel')}</EyebrowLabel>
            <div className="flex gap-2">
              <Field
                type="number"
                min={1}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('yourBidPlaceholder')}
                className="flex-1"
              />
              <Button
                variant={accent === 'primary' ? 'brown' : 'green'}
                size="md"
                disabled={pending || !amount}
                onClick={submit}
                className="shrink-0"
              >
                {pending ? t('submitting') : booking.myBid ? t('updateBid') : t('submitBid')}
              </Button>
            </div>
          </div>
          <Field
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('messagePlaceholder')}
            maxLength={300}
          />
          {booking.myBid && (
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              className="self-start font-body text-label font-semibold text-fy-error hover:underline disabled:opacity-50"
            >
              {t('withdraw')}
            </button>
          )}
        </div>
      )}
    </Panel>
  );
}
