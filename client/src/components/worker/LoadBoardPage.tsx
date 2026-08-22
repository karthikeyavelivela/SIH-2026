'use client';

import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { TopBar } from '@/components/ui/TopBar';
import { LayersIcon } from '@/components/ui/icons';
import { LoadBoardCard, type LoadBoardBooking, type LoadBoardBid } from './LoadBoardCard';

// Phase 6.2 — shared by driver and hamali_solo /loadboard pages. The server
// derives which type (truck vs hamali) the caller is eligible for from
// their role alone (loadboard.controller.ts's listLoadBoard) — this
// component sends nothing role-specific, same "server decides, client
// never claims a role" posture as DemandForecastWidget/RequestCard.
export function LoadBoardPage({ accent = 'primary' }: { accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('loadBoard');
  const { data, state, reload, setData } = usePolling(
    () => api.get<{ loads: LoadBoardBooking[] }>('/api/loadboard'),
    8000
  );

  async function placeBid(bookingId: string, amount: number, message?: string) {
    const res = await api.post<{ bid: LoadBoardBid }>(`/api/loadboard/${bookingId}/bids`, { amount, message });
    setData((prev) =>
      prev
        ? { loads: prev.loads.map((l) => (l._id === bookingId ? { ...l, myBid: res.bid } : l)) }
        : prev
    );
  }

  async function withdrawBid(bookingId: string, bidId: string) {
    await api.post(`/api/loadboard/${bookingId}/bids/${bidId}/withdraw`);
    setData((prev) => (prev ? { loads: prev.loads.map((l) => (l._id === bookingId ? { ...l, myBid: null } : l)) } : prev));
    await reload();
  }

  const loads = data?.loads ?? [];

  return (
    <div className="min-h-screen bg-ip-surface pb-24">
      <TopBar title={t('pageTitle')} showBack={false} />
      <div className="max-w-lg mx-auto px-ip-edge pt-ip-sm">
        <p className="text-sm text-ip-on-surface-variant mb-6">{t('subtitle')}</p>

        {state === 'loading' && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-40 rounded-lg bg-surface animate-pulse" />
            ))}
          </div>
        )}

        {state !== 'loading' && loads.length === 0 && (
          <div className="text-center py-16">
            <LayersIcon className="w-10 h-10 text-text-muted/50 mx-auto mb-3" />
            <p className="text-sm text-text-muted">{t('noLoads')}</p>
          </div>
        )}

        <div className="space-y-4">
          {loads.map((l) => (
            <LoadBoardCard key={l._id} booking={l} accent={accent} onBid={placeBid} onWithdraw={withdrawBid} />
          ))}
        </div>
      </div>
    </div>
  );
}
