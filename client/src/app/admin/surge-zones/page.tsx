'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { CompassIcon } from '@/components/ui/icons';

interface SurgeZone {
  _id: string;
  name: string;
  multiplier: number;
  expiresAt: string;
  isManual: boolean;
  createdAt: string;
}

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-ip-on-surface placeholder:text-ip-on-surface-variant/70 transition-colors focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

function minutesLeft(expiresAt: string): number {
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 60000));
}

// New page — DESIGN_INVENTORY.md regional_surge_zone_management (manager
// screen, reusing the admin/ route group per that doc). Reads
// server/src/models/SurgeZone.ts (new) via
// server/src/controllers/surgeZone.controller.ts (new). Region-name-based
// (not real polygon geo), mirroring FareRule's region-as-string approach.
export default function AdminSurgeZonesPage() {
  const t = useTranslations('adminSurgeZones');
  const { data, state, reload } = usePolling(
    () => api.get<{ active: SurgeZone[]; recentExpired: SurgeZone[]; maxMultiplier: number }>('/api/admin/surge-zones'),
    15000
  );
  const [form, setForm] = useState({ name: '', multiplier: '1.5', durationMinutes: '60' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  const active = data?.active ?? [];
  const recentExpired = data?.recentExpired ?? [];
  const maxMultiplier = data?.maxMultiplier ?? 3;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/surge-zones', {
        name: form.name,
        multiplier: Number(form.multiplier),
        durationMinutes: Number(form.durationMinutes),
      });
      setForm({ name: '', multiplier: '1.5', durationMinutes: '60' });
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('errorCreate'));
    } finally {
      setSubmitting(false);
    }
  }

  async function endZone(id: string) {
    setEndingId(id);
    try {
      await api.patch(`/api/admin/surge-zones/${id}/end`);
      await reload();
    } finally {
      setEndingId(null);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-10 animate-[fadeUp_400ms_ease-out]">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
        <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
        <p className="text-sm text-ip-on-surface-variant mb-6">{t('subtitle', { max: maxMultiplier })}</p>

        {state !== 'loading' && active.length === 0 && (
          <div className="ip-card mb-6">
            <EmptyState icon={<CompassIcon className="w-7 h-7" />} title={t('noActiveSurge')} description={t('noActiveSurgeDesc')} />
          </div>
        )}

        <div className="space-y-3 mb-8">
          {active.map((z) => (
            <div key={z._id} className="ip-card">
              <div className="flex items-center justify-between mb-2">
                <p className="font-heading font-bold">{z.name}</p>
                <StatusChip tone="primary" dot>{z.multiplier}x</StatusChip>
              </div>
              <p className="text-sm text-ip-on-surface-variant mb-3">
                {t('expiresIn', { mins: minutesLeft(z.expiresAt), kind: z.isManual ? t('manual') : t('automatic') })}
              </p>
              <button
                type="button"
                onClick={() => endZone(z._id)}
                disabled={endingId === z._id}
                className="text-xs font-semibold text-ip-error hover:underline disabled:opacity-50"
              >
                {endingId === z._id ? t('ending') : t('endNow')}
              </button>
            </div>
          ))}
        </div>

        {recentExpired.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">{t('recentlyEnded')}</p>
            <div className="space-y-2">
              {recentExpired.slice(0, 5).map((z) => (
                <div key={z._id} className="flex items-center justify-between text-sm text-ip-on-surface-variant px-1">
                  <span>{z.name} · {z.multiplier}x</span>
                  <span>{new Date(z.expiresAt).toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-secondary mb-2">{t('overrideEyebrow')}</p>
        <h2 className="font-heading text-ip-headline-sm font-bold mb-1">{t('newOverride')}</h2>
        <p className="text-sm text-ip-on-surface-variant mb-6">{t('newOverrideHint')}</p>
        <div className="ip-card">
          <form onSubmit={handleCreate} className="space-y-4">
            <input
              placeholder={t('regionNamePlaceholder')}
              aria-label={t('regionNamePlaceholder')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputClass}
              required
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
                {t('multiplierLabel', { max: maxMultiplier })}
              </label>
              <input
                type="number"
                step="0.1"
                min={1}
                max={maxMultiplier}
                value={form.multiplier}
                onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
                {t('durationLabel')}
              </label>
              <input
                type="number"
                min={5}
                max={1440}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
                className={inputClass}
                required
              />
            </div>
            {error && <p className="text-sm text-ip-error">{error}</p>}
            <Button type="submit" className="w-full" size="lg" disabled={submitting}>
              {submitting ? t('applying') : t('applyOverride')}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
