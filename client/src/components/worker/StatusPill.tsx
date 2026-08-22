'use client';

import { useTranslations } from 'next-intl';
import { BookingStatus } from '@/lib/types';

const toneClasses: Record<BookingStatus, string> = {
  requested: 'bg-text-muted/10 text-text-muted',
  searching: 'bg-primary/10 text-primary-600',
  matched: 'bg-primary/10 text-primary-600',
  accepted: 'bg-secondary/10 text-secondary-600',
  in_progress: 'bg-secondary/10 text-secondary-600',
  completed: 'bg-emerald-500/10 text-emerald-700',
  cancelled: 'bg-red-500/10 text-red-700',
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
