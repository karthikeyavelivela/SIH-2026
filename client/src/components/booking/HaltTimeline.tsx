'use client';

import { useTranslations } from 'next-intl';
import { usePolling } from '@/lib/usePolling';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { ShieldIcon, AlertIcon } from '@/components/ui/icons';

interface HaltEventDto {
  _id: string;
  arrivalTime: string;
  departureTime?: string;
  checkpointId?: { name: string; cctvAvailable: boolean; type: string } | null;
  sealIntact?: boolean;
  odometerReading?: number;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

// SIH26089 Phase D.1 — customer-facing chain-of-custody timeline. Only
// meaningful for vehicle transit (trucks carry cargo out of sight of the
// customer for real distance; hamali jobs don't have this exposure), and
// only once the booking has actually gone in_progress — a halt can't exist
// before then.
// Caller decides whether to mount this at all (only while the booking is
// in_progress/completed and is vehicle transit) — no internal `active` flag,
// same "don't poll what you're not rendering" discipline as the rest of
// this codebase's usePolling call sites.
export function HaltTimeline({ bookingId }: { bookingId: string }) {
  const t = useTranslations('trackBooking.haltTimeline');
  const { data } = usePolling(
    () => api.get<{ halts: HaltEventDto[] }>(`/api/checkpoints/booking/${bookingId}/halts`),
    15000,
    [bookingId]
  );

  const halts = data?.halts ?? [];
  if (halts.length === 0) return null;

  return (
    <Card elevation="raised" className="mb-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3 flex items-center gap-1.5">
        <ShieldIcon className="w-3.5 h-3.5" />
        {t('title')}
      </p>
      <div className="space-y-3">
        {halts.map((h) => {
          const unplanned = !h.checkpointId;
          return (
            <div key={h._id} className="flex items-start gap-2.5">
              {unplanned ? (
                <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-ip-error" />
              ) : (
                <ShieldIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600" />
              )}
              <div className="min-w-0 flex-1 text-sm">
                <p className={`font-semibold ${unplanned ? 'text-ip-error' : ''}`}>
                  {unplanned ? t('unplannedStop') : h.checkpointId!.name}
                </p>
                <p className="text-xs text-text-muted">
                  {formatTime(h.arrivalTime)}
                  {h.departureTime ? ` – ${formatTime(h.departureTime)}` : ` – ${t('ongoing')}`}
                  {h.sealIntact === false && ` · ${t('sealBroken')}`}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
