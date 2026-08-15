'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from './socket';

const PING_INTERVAL_MS = 7000; // spec: "every 5-10 seconds while status=in_progress, not continuously"

/**
 * Streams the caller's own position into booking:{id} while `active` is
 * true (the page controls that — only pass true once status is
 * in_progress, per the spec's "only transmit location while actively on a
 * job or toggled online"). Watches position continuously but only emits on
 * an interval, not on every raw geolocation callback, to match the
 * throttle requirement without fighting the browser's own position update
 * cadence.
 */
export function useLiveLocationBroadcast(bookingId: string | undefined, active: boolean) {
  const latestPos = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!active || !bookingId || !('geolocation' in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latestPos.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => {
        // Permission revoked mid-job or a transient GPS error — silently
        // stop updating rather than spamming the user with a modal for
        // something that doesn't block the actual job (start/complete
        // still work); the customer's map simply stops moving.
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    const interval = setInterval(() => {
      if (latestPos.current) {
        getSocket().emit('booking:location', { bookingId, ...latestPos.current });
      }
    }, PING_INTERVAL_MS);

    return () => {
      navigator.geolocation.clearWatch(watchId);
      clearInterval(interval);
    };
  }, [bookingId, active]);
}
