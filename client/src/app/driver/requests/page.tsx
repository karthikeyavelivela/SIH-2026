'use client';

import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useIncomingOffer } from '@/lib/useIncomingOffer';
import { Booking } from '@/lib/types';
import { RequestCard } from '@/components/worker/RequestCard';
import { OfferCard } from '@/components/worker/OfferCard';
import { LayersIcon } from '@/components/ui/icons';

export default function DriverRequestsPage() {
  const { data, state, reload, setData } = usePolling(
    () => api.get<{ requests: Booking[] }>('/api/requests'),
    6000
  );
  const { offer, responding, respond } = useIncomingOffer();

  async function respondToOffer(accept: boolean) {
    await respond(accept);
    await reload();
  }

  async function accept(bookingId: string) {
    await api.post(`/api/requests/${bookingId}/accept`);
    await reload();
  }

  async function reject(bookingId: string) {
    await api.post(`/api/requests/${bookingId}/reject`);
    setData((prev) => (prev ? { requests: prev.requests.filter((b) => b._id !== bookingId) } : prev));
  }

  const requests = data?.requests ?? [];

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-1">Job requests</h1>
      <p className="text-sm text-text-muted mb-6">Nearby truck jobs matching your vehicle. Refreshes automatically.</p>

      {offer && (
        <div className="mb-6">
          <OfferCard
            offer={offer}
            accent="primary"
            responding={responding}
            onAccept={() => respondToOffer(true)}
            onReject={() => respondToOffer(false)}
          />
        </div>
      )}

      {state === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {state !== 'loading' && requests.length === 0 && (
        <div className="text-center py-16">
          <LayersIcon className="w-10 h-10 text-text-muted/50 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No open requests right now. Make sure you're online — new jobs will appear here.</p>
        </div>
      )}

      <div className="space-y-4">
        {requests.map((b) => (
          <RequestCard key={b._id} booking={b} accent="primary" onAccept={accept} onReject={reject} />
        ))}
      </div>
    </div>
  );
}
