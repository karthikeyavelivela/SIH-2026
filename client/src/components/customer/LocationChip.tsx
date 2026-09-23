'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { Icon } from '@/components/ui/Icon';
import { Overlay } from '@/components/ui/Overlay';
import { AddressField, type GeoPoint } from '@/components/booking/AddressField';
import { Body, EyebrowLabel } from '@/components/fy/Text';

const AREA_KEY = 'fyro.area';

interface StoredArea {
  label: string;
  lat?: number;
  lng?: number;
}

function readArea(): StoredArea | null {
  try {
    const raw = localStorage.getItem(AREA_KEY);
    return raw ? (JSON.parse(raw) as StoredArea) : null;
  } catch {
    return null;
  }
}

/**
 * "Set your area" — a real control, not a label.
 *
 * It was a static chip linking to the profile page, showing either a saved
 * address's label or the words "Set your area" forever. Tapping it never
 * asked for anything.
 *
 * THE PERMISSION IS REQUESTED HERE AND ONLY HERE
 *
 * The browser gives a site one good chance at the location prompt: a
 * request fired on page load, before the person has expressed any interest
 * in being located, gets denied reflexively — and in Chrome a denial is
 * sticky, so the cost of asking badly is losing the ability to ask at all.
 * So nothing here runs on mount. The native prompt appears when, and only
 * when, somebody taps this chip and chooses "use my current location".
 *
 * AND A DENIAL IS NOT A DEAD END
 *
 * Whether the prompt is granted, denied, or the device has no GPS at all,
 * the sheet still offers typed search and any address already saved. A
 * customer who blocks location once must never be left with no way to say
 * where they are — that is the failure this replaces, only worse.
 */
export function LocationChip() {
  const t = useTranslations('locationChip');
  const { addresses } = useSavedAddresses();
  const [area, setArea] = useState<StoredArea | null>(null);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setArea(readArea());
  }, []);

  function commit(next: StoredArea) {
    setArea(next);
    setOpen(false);
    setError(null);
    try {
      localStorage.setItem(AREA_KEY, JSON.stringify(next));
    } catch {
      // Private window or blocked storage: the area still applies for this
      // session, it simply will not be remembered.
    }
  }

  /**
   * The real browser prompt. `getCurrentPosition` is what triggers it —
   * there is no way to show a native permission dialog from application
   * code, and a styled panel that imitates one would be a lie about who is
   * asking.
   */
  function useMyLocation() {
    setError(null);
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError(t('noGps'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          // Reuses the server's existing provider chain — LocationIQ then
          // Photon — rather than a second geocoder in the client.
          const res = await api.get<{ result: { displayName: string; region?: string } | null }>(
            `/api/geocode/reverse?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
          );
          const label = res.result?.region || res.result?.displayName?.split(',')[0];
          commit({
            // A position with no name attached is still a position. Better
            // to show the coordinates than to discard a granted permission.
            label: label ?? `${pos.coords.latitude.toFixed(3)}, ${pos.coords.longitude.toFixed(3)}`,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        } catch {
          setError(t('lookupFailed'));
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        // PERMISSION_DENIED === 1. Recorded so the sheet stops offering the
        // button that can no longer do anything and says why.
        if (err.code === err.PERMISSION_DENIED) setDenied(true);
        setError(err.code === err.PERMISSION_DENIED ? t('deniedHint') : t('lookupFailed'));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  const label = area?.label ?? addresses[0]?.label ?? t('setArea');
  const isSet = Boolean(area?.label ?? addresses[0]?.label);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start inline-flex items-center gap-1.5 min-h-[36px] px-3 rounded-full bg-fy-edge text-fy-ink-soft font-body text-label min-w-0"
      >
        <Icon name={isSet ? 'location_on' : 'add_location_alt'} size={15} className="text-fy-brown shrink-0" />
        <span className="truncate max-w-[190px]">{label}</span>
        <Icon name="expand_more" size={15} className="shrink-0" />
      </button>

      {open && (
        <Overlay>
          <div className="fixed inset-0 z-[75] flex items-end justify-center" role="dialog" aria-modal="true">
            <button
              type="button"
              aria-label={t('close')}
              onClick={() => setOpen(false)}
              className="absolute inset-0 bg-fy-ink/45 backdrop-blur-[2px] cursor-default"
            />

            <div
              className="relative w-full max-w-2xl rounded-t-sheet bg-fy-bone shadow-float px-gutter pt-3 flex flex-col gap-3"
              style={{ paddingBottom: 'calc(1.5rem + var(--fy-safe-b))' }}
            >
              <span aria-hidden className="mx-auto mb-1 block h-1 w-10 rounded-full bg-fy-hairline" />
              <h2 className="font-heading text-title text-fy-ink">{t('title')}</h2>

              {/* Offered first, and only offered while it can still work. */}
              {!denied && (
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locating}
                  className="flex items-center gap-3 min-h-[52px] px-3.5 rounded-card bg-fy-brown text-fy-on-brown disabled:opacity-60"
                >
                  <Icon name={locating ? 'progress_activity' : 'my_location'} size={20} className={locating ? 'animate-spin' : ''} />
                  <span className="font-body text-body font-semibold">
                    {locating ? t('locating') : t('useMyLocation')}
                  </span>
                </button>
              )}

              {error && (
                <div role="alert" className="rounded-control bg-fy-error-bg px-3.5 py-2.5 font-body text-label text-fy-on-error-bg">
                  {error}
                </div>
              )}

              {/* Always present — this is the path that survives a denial.
                  AddressField is the same autocomplete the booking screens
                  use, so a typed area resolves through the same geocoder
                  the GPS path does. */}
              <AddressField
                label={t('orType')}
                placeholder={t('searchPlaceholder')}
                value={null}
                onChange={(point: GeoPoint | null) => {
                  if (!point) return;
                  commit({
                    label: point.region || point.address.split(',')[0],
                    lat: point.lat,
                    lng: point.lng,
                  });
                }}
                markerColorClass="text-fy-brown"
              />

              {addresses.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <EyebrowLabel>{t('saved')}</EyebrowLabel>
                  <div className="flex flex-wrap gap-2">
                    {addresses.map((a) => (
                      <button
                        key={a._id}
                        type="button"
                        onClick={() =>
                          commit({ label: a.label, lat: a.coordinates[1], lng: a.coordinates[0] })
                        }
                        className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full bg-fy-panel border border-fy-hairline/60 font-body text-label text-fy-ink"
                      >
                        <Icon name="bookmark" size={14} className="text-fy-brown" />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <Body size="label">{t('whyNote')}</Body>
            </div>
          </div>
        </Overlay>
      )}
    </>
  );
}
