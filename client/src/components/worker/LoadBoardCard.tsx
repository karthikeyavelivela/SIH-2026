'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Booking } from '@/lib/types';
import { ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { TruckIcon, BoxIcon, MapPinIcon, AlertIcon } from '@/components/ui/icons';

const typeIcon = { truck: TruckIcon, hamali: BoxIcon };

export interface LoadBoardBid {
  _id: string;
  amount: number;
  message?: string;
  status: string;
}

export type LoadBoardBooking = Booking & { myBid: LoadBoardBid | null };

interface LoadBoardCardProps {
  booking: LoadBoardBooking;
  accent?: 'primary' | 'secondary';
  onBid: (bookingId: string, amount: number, message?: string) => Promise<void>;
  onWithdraw: (bookingId: string, bidId: string) => Promise<void>;
}

// Phase 6.2 — one card per open-for-bidding load. Distinct from
// RequestCard (that one is "accept at the fixed price"); this one is
// always "propose your own price" — the reference fare is shown as
// context, never as a button to accept outright (the server-side guard in
// bookingAssignment.service.ts backs this up: a flat-fare accept 409s on
// one of these regardless of what the UI does).
export function LoadBoardCard({ booking, accent = 'primary', onBid, onWithdraw }: LoadBoardCardProps) {
  const t = useTranslations('loadBoard');
  const Icon = typeIcon[booking.type as 'truck' | 'hamali'] ?? TruckIcon;
  const accentText = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';
  const accentBg = accent === 'primary' ? 'bg-primary/10' : 'bg-secondary/10';

  const [amount, setAmount] = useState(booking.myBid ? String(booking.myBid.amount) : '');
  const [message, setMessage] = useState(booking.myBid?.message ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="rounded-lg bg-surface-raised border border-border shadow-md p-5 animate-[scaleIn_250ms_ease-out]">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${accentBg} ${accentText}`}>
            <Icon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <p className="font-heading font-bold text-base capitalize">{booking.type} {t('load')}</p>
            {booking.distanceKm > 0 && <p className="text-xs text-text-muted">{t('distanceTrip', { km: booking.distanceKm.toFixed(1) })}</p>}
          </div>
        </div>
        <div className="text-right whitespace-nowrap">
          <p className="text-xs text-text-muted">{t('referenceFare')}</p>
          <p className="font-heading font-bold text-lg">₹{booking.fareBreakdown.total}</p>
        </div>
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

      {error && (
        <div role="alert" className="flex items-start gap-2 mb-4 rounded-md border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">
          <AlertIcon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="flex gap-2 mb-2">
        <input
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={t('yourBidPlaceholder')}
          className="flex-1 min-h-[44px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20"
        />
        <Button
          variant={accent === 'primary' ? 'primary' : 'secondary'}
          disabled={pending || !amount}
          onClick={submit}
        >
          {pending ? t('submitting') : booking.myBid ? t('updateBid') : t('placeBid')}
        </Button>
      </div>
      <input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('messagePlaceholder')}
        maxLength={300}
        className="w-full min-h-[40px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-xs mb-2"
      />

      {booking.myBid && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">{t('yourCurrentBid', { amount: booking.myBid.amount })}</p>
          <button type="button" onClick={withdraw} disabled={pending} className="text-xs font-semibold text-red-600 underline disabled:opacity-50">
            {t('withdraw')}
          </button>
        </div>
      )}
    </div>
  );
}
