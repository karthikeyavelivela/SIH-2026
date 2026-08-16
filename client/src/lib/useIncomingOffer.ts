'use client';

import { useEffect, useState, useCallback } from 'react';
import { getSocket } from './socket';
import { notifyUser } from './notify';

export interface IncomingOffer {
  bookingId: string;
  type: string;
  pickupAddress: string;
  dropAddress: string;
  distanceKm: number;
  total: number;
  expiresAt: number;
}

/**
 * Phase 3's pushed exclusive offer — the "single best-ranked candidate...
 * ~20 seconds to respond" flow, replacing the fake-countdown-free browse
 * list as the PRIMARY way a worker hears about a job. The browse list
 * (GET /api/requests, still polled by the pages using this hook) stays
 * alongside it, not removed — either channel can win the same atomic
 * accept.
 */
export function useIncomingOffer() {
  const [offer, setOffer] = useState<IncomingOffer | null>(null);
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    function onOffer(payload: IncomingOffer) {
      setOffer(payload);
      notifyUser('New job request', `₹${payload.total} · ${payload.distanceKm.toFixed(1)} km — respond fast, it expires soon.`);
    }
    function onClosed(payload: { bookingId: string }) {
      setOffer((current) => (current?.bookingId === payload.bookingId ? null : current));
    }

    socket.on('booking:offer', onOffer);
    socket.on('booking:offer_closed', onClosed);
    return () => {
      socket.off('booking:offer', onOffer);
      socket.off('booking:offer_closed', onClosed);
    };
  }, []);

  const respond = useCallback(
    (accept: boolean) =>
      new Promise<{ ok: boolean; error?: string }>((resolve) => {
        if (!offer) {
          resolve({ ok: false, error: 'No active offer' });
          return;
        }
        setResponding(true);
        getSocket().emit(
          'booking:offer_response',
          { bookingId: offer.bookingId, accept },
          (ack: { ok: boolean; error?: string }) => {
            setResponding(false);
            if (ack?.ok || !accept) setOffer(null); // clears on any settled response; a failed accept also clears since the offer is spent either way
            resolve(ack ?? { ok: false });
          }
        );
      }),
    [offer]
  );

  return { offer, responding, respond };
}
