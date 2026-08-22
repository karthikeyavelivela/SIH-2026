'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { PowerIcon, AlertIcon } from '@/components/ui/icons';

type Accent = 'primary' | 'secondary';

interface OnlineToggleProps {
  status: 'online' | 'offline' | 'on_job';
  onStatusChange: (status: 'online' | 'offline') => void;
  accent?: Accent;
}

const accentClasses: Record<Accent, string> = {
  primary: 'bg-primary-600 shadow-glow-primary',
  secondary: 'bg-secondary-600 shadow-glow-secondary',
};

// Shared by driver / hamali_solo / mutha_leader dashboards. Requests
// browser geolocation only at the moment of going online (never
// continuously, never while offline) and surfaces a denied/unavailable
// permission with a clear explanation rather than failing silently — a
// design principle from DESIGN.md/PRODUCT.md, not an incidental choice.
export function OnlineToggle({ status, onStatusChange, accent = 'primary' }: OnlineToggleProps) {
  const t = useTranslations('worker.onlineToggle');
  const [pending, setPending] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const isOnline = status === 'online' || status === 'on_job';
  const onJob = status === 'on_job';

  async function goOffline() {
    setPending(true);
    setLocationError(null);
    try {
      await api.patch('/api/availability', { status: 'offline' });
      onStatusChange('offline');
    } catch (err) {
      setLocationError(err instanceof ApiClientError ? err.message : t('goOfflineError'));
    } finally {
      setPending(false);
    }
  }

  async function goOnline() {
    if (!('geolocation' in navigator)) {
      setLocationError(t('noGeoSupport'));
      return;
    }
    setPending(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await api.patch('/api/availability', {
            status: 'online',
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
          onStatusChange('online');
        } catch (err) {
          setLocationError(err instanceof ApiClientError ? err.message : t('goOnlineError'));
        } finally {
          setPending(false);
        }
      },
      (geoErr) => {
        setPending(false);
        setLocationError(
          geoErr.code === geoErr.PERMISSION_DENIED ? t('permissionDenied') : t('locationUnavailable')
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={isOnline}
        disabled={pending || onJob}
        onClick={() => (isOnline ? goOffline() : goOnline())}
        className="w-full flex items-center justify-between gap-3 rounded-lg bg-surface-raised border border-border shadow-md px-5 py-4 transition-all duration-base disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-3">
          <span
            className={`w-11 h-11 rounded-full flex items-center justify-center text-white transition-colors duration-base ${
              isOnline ? accentClasses[accent] : 'bg-text-muted/30'
            }`}
          >
            <PowerIcon className="w-5 h-5" />
          </span>
          <div className="text-left">
            <p className="font-heading font-bold text-base leading-tight">
              {onJob ? t('onJob') : isOnline ? t('online') : t('offline')}
            </p>
            <p className="text-xs text-text-muted">
              {onJob ? t('onJobHint') : isOnline ? t('onlineHint') : t('offlineHint')}
            </p>
          </div>
        </div>
        <span
          className={`relative w-12 h-7 rounded-full transition-colors duration-base flex-shrink-0 ${
            isOnline ? (accent === 'primary' ? 'bg-primary-600' : 'bg-secondary-600') : 'bg-border-strong'
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-base ease-out-expo ${
              isOnline ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </span>
      </button>

      {locationError && (
        <div role="alert" className="mt-3 flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p>{locationError}</p>
        </div>
      )}
    </div>
  );
}
