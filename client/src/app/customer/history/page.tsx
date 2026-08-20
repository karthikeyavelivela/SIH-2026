'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
    <div className="min-h-screen bg-ip-surface">
      <div className="max-w-lg mx-auto px-ip-edge pt-ip-lg pb-ip-xl">
        <h1 className="font-heading font-extrabold text-ip-display-md text-ip-on-surface mb-6">Booking history</h1>

        {state === 'loading' && (
          <div className="ip-card">
            <Skeleton lines={4} className="h-16" />
          </div>
        )}

        {state !== 'loading' && bookings.length === 0 && (
          <div className="ip-card">
            <EmptyState
              icon={<ClockIcon className="w-6 h-6" />}
              title={state === 'unavailable' ? 'History unavailable' : 'No bookings yet'}
              description={
                state === 'unavailable'
                  ? "Booking history isn't available right now."
                  : 'Everything you book will show up here.'
              }
              action={
                <Link href="/customer/book" className="text-sm font-semibold text-ip-primary hover:underline">
                  Book your first delivery →
                </Link>
              }
            />
          </div>
        )}

        {bookings.length > 0 && (
          <div className="ip-card">
            {bookings.map((b, i) => (
              <div key={b._id}>
                <Link
                  href={`/customer/track/${b._id}`}
                  className="flex items-center justify-between gap-3 py-ip-sm -mx-2 px-2 rounded-ip-input active:bg-ip-surface-container-high transition-colors group"
                >
                  <div className="flex items-center gap-ip-sm min-w-0">
                    <div className="w-10 h-10 rounded-full bg-ip-surface-container-highest group-hover:bg-ip-primary-container group-hover:text-ip-on-primary transition-colors flex items-center justify-center text-ip-on-surface-variant flex-shrink-0">
                      {b.type === 'hamali' ? <BoxIcon className="w-5 h-5" /> : <TruckIcon className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ip-on-surface truncate">
                        {b.pickupLocation.address.split(',')[0]} → {b.dropLocation.address.split(',')[0]}
                      </p>
                      <p className="text-ip-body-sm text-ip-on-surface-variant">
                        ₹{b.fareBreakdown.total} · {new Date(b.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusChip tone={statusTone[b.status] ?? 'muted'}>{b.status.replace('_', ' ')}</StatusChip>
                    <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
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
