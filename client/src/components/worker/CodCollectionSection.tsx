'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { WalletIcon } from '@/components/ui/icons';

interface CodItem {
  payment: { _id: string; amount: number; bookingId: string };
  booking: { _id: string; dropLocation: { address: string } };
}

// SIH26089 COD payments — "cash to collect" list for whichever worker
// actually did the job. Only the worker who was physically there can
// confirm cash changed hands (see Payment.codConfirmedBy's own doc
// comment), so this lives on the worker's own earnings screen, not the
// customer's. Dropped into driver/hamali/mutha-member earnings pages —
// not the mutha LEADER's, since a leader doesn't personally collect cash.
export function CodCollectionSection({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('worker.codCollection');
  const { data, reload } = usePolling(() => api.get<{ items: CodItem[] }>('/api/payments/cod/pending'), 20000);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = data?.items ?? [];
  if (items.length === 0) return null;

  async function confirm(bookingId: string) {
    setConfirmingId(bookingId);
    setError(null);
    try {
      await api.post(`/api/payments/${bookingId}/cod/confirm`);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setConfirmingId(null);
    }
  }

  const tone = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';

  return (
    <div className="mb-6">
      <h2 className="font-heading text-lg font-bold mb-3 flex items-center gap-1.5">
        <WalletIcon className={`w-4.5 h-4.5 ${tone}`} />
        {t('title')}
      </h2>
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
      <div className="space-y-3">
        {items.map(({ payment, booking }) => (
          <Card key={payment._id} elevation="raised">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-heading font-bold text-lg">₹{payment.amount}</p>
                <p className="text-xs text-ip-on-surface-variant truncate">{booking.dropLocation.address}</p>
              </div>
              <Button
                className="!px-4 !py-2 !text-xs !min-h-0 flex-shrink-0"
                disabled={confirmingId !== null}
                onClick={() => confirm(booking._id)}
              >
                {confirmingId === booking._id ? t('confirming') : t('confirmReceived')}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
