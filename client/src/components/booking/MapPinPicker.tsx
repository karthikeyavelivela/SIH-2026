'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/fy/Controls';
import type { GeoPoint } from '@/components/booking/AddressField';

/**
 * Drop a pin instead of typing an address.
 *
 * Address search depends on a third party, and on 2026-09-12 that third
 * party rate-limited this server and took every booking in the product down
 * with it — because typing an address was the only way to produce
 * coordinates. This screen removes that single point of failure: a customer
 * can always place a pin on a map and book, with no lookup involved.
 *
 * Reverse geocoding is attempted to give the pin a human-readable label, but
 * it is explicitly optional. If it fails, the coordinates are still valid and
 * the booking still proceeds with a plain "Pinned location" label — the
 * label is a nicety, the position is the data.
 */

const DEFAULT_CENTER: [number, number] = [17.6868, 83.2185]; // Visakhapatnam
const DEFAULT_ZOOM = 13;

export function MapPinPicker({
  open,
  onClose,
  onPick,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (point: GeoPoint) => void;
  initial?: GeoPoint | null;
}) {
  const t = useTranslations('booking.pin');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markerRef = useRef<unknown>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number }>(() =>
    initial ? { lat: initial.lat, lng: initial.lng } : { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] }
  );
  const [label, setLabel] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Leaflet is loaded lazily and only in the browser — it touches `window`
  // at import time, so a static import would break the server render.
  useEffect(() => {
    if (!open || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !containerRef.current) return;

      const map = L.map(containerRef.current, { attributionControl: true }).setView(
        [coords.lat, coords.lng],
        DEFAULT_ZOOM
      );
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const marker = L.marker([coords.lat, coords.lng], { draggable: true }).addTo(map);

      const commit = (lat: number, lng: number) => {
        setCoords({ lat, lng });
        void resolveLabel(lat, lng);
      };

      marker.on('dragend', () => {
        const p = marker.getLatLng();
        commit(p.lat, p.lng);
      });
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        commit(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      // Leaflet mis-measures inside a sheet that animates in.
      setTimeout(() => map.invalidateSize(), 250);
      void resolveLabel(coords.lat, coords.lng);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Tear the map down when the sheet closes, so reopening builds a fresh one.
  useEffect(() => {
    if (open) return;
    const map = mapRef.current as { remove?: () => void } | null;
    map?.remove?.();
    mapRef.current = null;
    markerRef.current = null;
  }, [open]);

  /** Best-effort label. Never blocks picking — see the component doc. */
  async function resolveLabel(lat: number, lng: number) {
    setResolving(true);
    setLabel(null);
    try {
      const res = await api.get<{ result: { displayName: string; region?: string } | null }>(
        `/api/geocode/reverse?lat=${lat}&lng=${lng}`
      );
      setLabel(res.result?.displayName ?? null);
    } catch (err) {
      // 503 here means the geocoder is down — exactly the case this picker
      // exists for. The pin is still usable.
      void (err instanceof ApiClientError);
      setLabel(null);
    } finally {
      setResolving(false);
    }
  }

  async function confirm() {
    let region: string | undefined;
    let address = label ?? t('pinnedLocation');
    try {
      const res = await api.get<{ result: { displayName: string; region?: string } | null }>(
        `/api/geocode/reverse?lat=${coords.lat}&lng=${coords.lng}`
      );
      if (res.result) {
        address = res.result.displayName;
        region = res.result.region;
      }
    } catch {
      // Keep the fallback label and let the server's own
      // "No active fare rule for {region}/{category}" surface honestly if the
      // region cannot be derived.
    }
    onPick({ lat: coords.lat, lng: coords.lng, address, region });
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fy-bone">
      <header className="flex items-center justify-between gap-3 px-gutter h-16 border-b border-fy-brown/12 shrink-0">
        <span className="flex flex-col min-w-0">
          <span className="font-mono text-[10px] uppercase tracking-widest text-fy-muted">{t('eyebrow')}</span>
          <span className="font-heading text-title text-fy-ink truncate">{t('title')}</span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('cancel')}
          className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center hover:bg-fy-panel transition-colors shrink-0"
        >
          <span aria-hidden className="material-symbols-outlined text-[20px] text-fy-ink">
            close
          </span>
        </button>
      </header>

      <div ref={containerRef} className="flex-1 min-h-0" />

      <div className="shrink-0 border-t border-fy-brown/12 bg-fy-bone px-gutter py-4 flex flex-col gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span aria-hidden className="material-symbols-outlined text-[20px] text-fy-brown shrink-0 mt-0.5">
            location_on
          </span>
          <span className="flex flex-col min-w-0">
            <span className="font-body text-body text-fy-ink break-words">
              {resolving ? t('resolving') : (label ?? t('pinnedLocation'))}
            </span>
            <span className="font-mono text-[10px] text-fy-muted">
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </span>
          </span>
        </div>
        <p className="font-body text-eyebrow text-fy-muted">{t('hint')}</p>
        <Button className="w-full" glyph="check" onClick={confirm}>
          {t('confirm')}
        </Button>
      </div>
    </div>
  );
}
