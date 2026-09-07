'use client';

import { useTranslations } from 'next-intl';
import { BookingStatus } from '@/lib/types';

const toneClasses: Record<BookingStatus, string> = {
  requested: 'bg-fy-well text-fy-muted',
  searching: 'bg-fy-brown/10 text-fy-brown',
  matched: 'bg-fy-brown/10 text-fy-brown',
  accepted: 'bg-fy-green/10 text-fy-green',
  in_progress: 'bg-fy-green/10 text-fy-green',
  completed: 'bg-fy-lime/30 text-fy-green',
  cancelled: 'bg-fy-error-bg text-fy-on-error-bg',
};

const STATUS_KEY: Record<BookingStatus, string> = {
  requested: 'requested',
  searching: 'searching',
  matched: 'matched',
  accepted: 'accepted',
  in_progress: 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
};

export function StatusPill({ status }: { status: BookingStatus }) {
  const t = useTranslations('worker.statusPill');
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${toneClasses[status]}`}>
      {(status === 'searching' || status === 'in_progress') && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" aria-hidden="true" />
      )}
      {t(STATUS_KEY[status])}
    </span>
  );
}
