'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { MapPinIcon } from '@/components/ui/icons';

interface HaltEventDto {
  _id: string;
  arrivalTime: string;
  departureTime?: string;
  checkpointId?: { name: string; cctvAvailable: boolean } | null;
  sealIntact?: boolean;
}

// SIH26089 Phase D.1 — driver-facing halt check-in/check-out. Only rendered
// while the booking is in_progress (same gate as live-location broadcast).
// Real geolocation, not a typed-in guess — same navigator.geolocation
// primitive useLiveLocationBroadcast already uses elsewhere on this page.
export function HaltCheckIn({ bookingId, accent = 'primary' }: { bookingId: string; accent?: 'primary' | 'secondary' }) {
  const t = useTranslations('activeJob.halt');
  const [openHalt, setOpenHalt] = useState<HaltEventDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [odometer, setOdometer] = useState('');
  const [sealIntact, setSealIntact] = useState<boolean | null>(null);

  useEffect(() => {
    // Recover an already-open halt after a page reload mid-stop.
    api
      .get<{ halts: HaltEventDto[] }>(`/api/checkpoints/booking/${bookingId}/halts`)
      .then((res) => {
        const open = res.halts.find((h) => !h.departureTime);
        if (open) setOpenHalt(open);
      })
      .catch(() => {});
  }, [bookingId]);

  function getPosition(): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        reject(new Error('no-geo'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 5000 });
    });
  }

  async function checkIn() {
    setLoading(true);
    setError(null);
    try {
      const pos = await getPosition();
      const res = await api.post<{ halt: HaltEventDto; matchedCheckpoint: { name: string } | null }>(
        '/api/checkpoints/halts/check-in',
        { bookingId, lat: pos.coords.latitude, lng: pos.coords.longitude }
      );
      setOpenHalt(res.halt);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorLocation'));
    } finally {
      setLoading(false);
    }
  }

  async function checkOut() {
    if (!openHalt) return;
    setLoading(true);
    setError(null);
    try {
      await api.patch(`/api/checkpoints/halts/${openHalt._id}/check-out`, {
        odometerReading: odometer ? Number(odometer) : undefined,
        sealIntact: sealIntact ?? undefined,
      });
      setOpenHalt(null);
      setOdometer('');
      setSealIntact(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setLoading(false);
    }
  }

  const tone = accent === 'primary' ? 'text-primary-600' : 'text-secondary-600';

  return (
    <div className="ip-card mb-6">
      <p className="font-heading font-bold text-sm uppercase tracking-wide text-ip-on-surface-variant mb-2 flex items-center gap-1.5">
        <MapPinIcon className={`w-4 h-4 ${tone}`} />
        {t('title')}
      </p>

      {!openHalt ? (
        <>
          <p className="text-xs text-ip-on-surface-variant mb-3">{t('description')}</p>
          <Button type="button" variant="secondary" className="w-full" disabled={loading} onClick={checkIn}>
            {loading ? t('checkingIn') : t('checkInButton')}
          </Button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            {openHalt.checkpointId
              ? t('stoppedAtCheckpoint', { name: openHalt.checkpointId.name })
              : t('unplannedStopWarning')}
          </p>
          <div>
            <label className="text-xs text-ip-on-surface-variant block mb-1">{t('odometerLabel')}</label>
            <input
              type="number"
              inputMode="numeric"
              value={odometer}
              onChange={(e) => setOdometer(e.target.value)}
              placeholder={t('odometerPlaceholder')}
              className="w-full rounded-ip-card border border-ip-outline/30 bg-ip-surface px-3 py-2 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSealIntact(true)}
              className={`flex-1 text-xs font-semibold py-2 rounded-ip-card border ${sealIntact === true ? 'bg-emerald-600 text-white border-emerald-600' : 'border-ip-outline/30 text-ip-on-surface-variant'}`}
            >
              {t('sealIntactYes')}
            </button>
            <button
              type="button"
              onClick={() => setSealIntact(false)}
              className={`flex-1 text-xs font-semibold py-2 rounded-ip-card border ${sealIntact === false ? 'bg-ip-error text-white border-ip-error' : 'border-ip-outline/30 text-ip-on-surface-variant'}`}
            >
              {t('sealIntactNo')}
            </button>
          </div>
          <Button type="button" className="w-full" disabled={loading} onClick={checkOut}>
            {loading ? t('checkingOut') : t('checkOutButton')}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
