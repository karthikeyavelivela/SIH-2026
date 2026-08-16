'use client';

import { useEffect, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { AddressField, GeoPoint } from '@/components/booking/AddressField';
import { Button } from '@/components/ui/Button';
import { CompassIcon, MapPinIcon } from '@/components/ui/icons';

interface ServiceAreaCardProps {
  initial: { lat: number; lng: number } | null;
  radiusKm: number;
  accent?: 'primary' | 'secondary';
}

// "Willing location" — a self-set anchor point, separate from live GPS.
// Declaring one gets a worker matched against jobs within a much wider
// radius (200km driver / 20km hamali — see matching.service.ts) centered
// on THIS point, instead of only ever being found near wherever their live
// GPS ping happens to be at go-online time. Useful for "I'm based out of
// this depot/town and will travel for the right job" workers.
export function ServiceAreaCard({ initial, radiusKm, accent = 'primary' }: ServiceAreaCardProps) {
  const [editing, setEditing] = useState(false);
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) {
      setLabel(null);
      return;
    }
    api
      .get<{ result: { lat: number; lon: number; displayName: string } | null }>(
        `/api/geocode/reverse?lat=${initial.lat}&lng=${initial.lng}`
      )
      .then((res) => setLabel(res.result?.displayName ?? `${initial.lat.toFixed(3)}, ${initial.lng.toFixed(3)}`))
      .catch(() => setLabel(`${initial.lat.toFixed(3)}, ${initial.lng.toFixed(3)}`));
  }, [initial?.lat, initial?.lng]);

  async function save(next: { lat: number; lng: number } | null) {
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/availability/willing-location', { lat: next?.lat ?? null, lng: next?.lng ?? null });
      setLabel(next ? point?.address ?? null : null);
      setEditing(false);
      setPoint(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not save your service area — try again.');
    } finally {
      setSaving(false);
    }
  }

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setError('This device/browser has no location support.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setLocating(false);
        await save({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setError('Location access was denied — search for an address instead.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const tint = accent === 'primary' ? 'text-primary-600 bg-primary/10' : 'text-secondary-600 bg-secondary/10';

  return (
    <div className="rounded-lg bg-surface-raised border border-border shadow-sm p-4 mb-6">
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm font-semibold">Service area</p>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${tint}`}>{radiusKm} km radius</span>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Set a home base and get matched to jobs anchored near it — even before your live location does.
      </p>

      {!editing ? (
        <div className="flex items-center gap-3">
          <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tint}`}>
            <MapPinIcon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{label ?? 'Not set'}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className={`text-xs font-semibold flex-shrink-0 ${accent === 'primary' ? 'text-primary-600' : 'text-secondary-600'}`}>
            {label ? 'Change' : 'Set'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AddressField
            label="Search an address"
            placeholder="e.g. your depot, home town…"
            value={point}
            onChange={setPoint}
            markerColorClass={accent === 'primary' ? 'text-primary-600' : 'text-secondary-600'}
          />
          <Button
            type="button"
            variant="ghost"
            size="md"
            className="w-full"
            disabled={locating}
            onClick={useCurrentLocation}
          >
            <CompassIcon className="w-4 h-4 mr-1.5" />
            {locating ? 'Finding you…' : 'Use my current location'}
          </Button>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button
              type="button"
              size="md"
              className="flex-1"
              disabled={!point || saving}
              onClick={() => save(point ? { lat: point.lat, lng: point.lng } : null)}
              variant={accent === 'primary' ? 'primary' : 'secondary'}
            >
              {saving ? 'Saving…' : 'Save'}
            </Button>
            {initial && (
              <Button type="button" variant="danger" size="md" disabled={saving} onClick={() => save(null)}>
                Clear
              </Button>
            )}
            <Button type="button" variant="ghost" size="md" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
