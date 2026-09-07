'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { StatusChip } from '@/components/ui/StatusChip';
import { ListDivider } from '@/components/ui/ListDivider';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { TruckIcon, BoxIcon, ChevronRightIcon, ClockIcon } from '@/components/ui/icons';

interface BookingSummary {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  fareBreakdown: { total: number };
  pickupLocation: { address: string };
  dropLocation: { address: string };
  createdAt: string;
}

const statusTone: Record<string, 'success' | 'secondary' | 'muted' | 'danger' | 'primary'> = {
  completed: 'success',
  in_progress: 'primary',
  matched: 'secondary',
  accepted: 'secondary',
  searching: 'muted',
  requested: 'muted',
  cancelled: 'danger',
};

export default function CustomerHistoryPage() {
  const t = useTranslations('customerHistory');
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    api
      .get<{ bookings: BookingSummary[] }>('/api/bookings')
      .then((res) => {
        setBookings(res.bookings);
        setState('ready');
      })
      .catch(() => setState('unavailable'));
  }, []);

  return (
    <div className="min-h-screen bg-fy-bone">
      <div className="max-w-lg mx-auto px-gutter pt-8 pb-12">
        <h1 className="font-heading font-extrabold text-heading text-fy-ink mb-6">{t('title')}</h1>

        {state === 'loading' && (
          <div className="fy-surface-card">
            <Skeleton lines={4} className="h-16" />
          </div>
        )}

        {state !== 'loading' && bookings.length === 0 && (
          <div className="fy-surface-card">
            <EmptyState
              icon={<ClockIcon className="w-6 h-6" />}
              title={state === 'unavailable' ? t('unavailableTitle') : t('emptyTitle')}
              description={state === 'unavailable' ? t('unavailableDescription') : t('emptyDescription')}
              action={
                <Link href="/customer/book" className="text-sm font-semibold text-fy-brown hover:underline">
                  {t('bookFirst')}
                </Link>
              }
            />
          </div>
        )}

        {bookings.length > 0 && (
          <div className="fy-surface-card">
            {bookings.map((b, i) => (
              <div key={b._id}>
                <Link
                  href={`/customer/track/${b._id}`}
                  className="flex items-center justify-between gap-3 py-4 -mx-2 px-2 rounded-control active:bg-fy-well transition-colors group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-fy-edge group-hover:bg-fy-brown-soft group-hover:text-fy-on-brown transition-colors flex items-center justify-center text-fy-ink-soft flex-shrink-0">
                      {b.type === 'hamali' ? <BoxIcon className="w-5 h-5" /> : <TruckIcon className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-fy-ink truncate">
                        {b.pickupLocation.address.split(',')[0]} → {b.dropLocation.address.split(',')[0]}
                      </p>
                      <p className="text-label text-fy-ink-soft">
                        ₹{b.fareBreakdown.total} · {new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusChip tone={statusTone[b.status] ?? 'muted'}>{t(`status.${b.status}` as never)}</StatusChip>
                    <ChevronRightIcon className="w-4 h-4 text-fy-ink-soft" />
                  </div>
                </Link>
                {i < bookings.length - 1 && <ListDivider />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
