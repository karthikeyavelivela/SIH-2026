'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { TruckIcon, BoxIcon } from '@/components/ui/icons';

interface BookingSummary {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  fareBreakdown: { total: number };
  pickupLocation: { address: string };
  dropLocation: { address: string };
  createdAt: string;
}

const statusTone: Record<string, 'success' | 'secondary' | 'muted' | 'danger'> = {
  completed: 'success',
  in_progress: 'secondary',
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
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Booking history</h1>

      {state === 'loading' && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {state !== 'loading' && bookings.length === 0 && (
        <Card elevation="raised" className="text-center py-12">
          <p className="text-sm text-text-muted mb-4">
            {state === 'unavailable' ? 'Booking history isn’t available right now.' : 'No bookings yet.'}
          </p>
          <Link href="/customer/book" className="text-sm font-semibold text-primary-600 hover:underline">
            Book your first delivery →
          </Link>
        </Card>
      )}

      {bookings.length > 0 && (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Link key={b._id} href={`/customer/track/${b._id}`} className="block">
              <Card elevation="raised" className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-base">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center flex-shrink-0">
                      {b.type === 'hamali' ? <BoxIcon className="w-4 h-4" /> : <TruckIcon className="w-4 h-4" />}
                    </div>
                    <p className="text-sm font-semibold capitalize">{b.type}</p>
                  </div>
                  <Badge tone={statusTone[b.status] ?? 'muted'}>{b.status.replace('_', ' ')}</Badge>
                </div>
                <p className="text-sm text-text-muted truncate">
                  {b.pickupLocation.address} → {b.dropLocation.address}
                </p>
                <p className="text-sm font-heading font-bold mt-2">₹{b.fareBreakdown.total}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
