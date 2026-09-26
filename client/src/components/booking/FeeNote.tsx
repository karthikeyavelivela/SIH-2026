'use client';

import { useTranslations } from 'next-intl';
import type { FareBreakdown } from '@/lib/types';

/**
 * P1.1 — one line under a fare estimate: how much goes to the worker and how
 * much is the service fee. Renders nothing for a fare priced without one.
 */
export function FeeNote({ fare, className = '' }: { fare: Pick<FareBreakdown, 'workerRate' | 'serviceFee' | 'serviceFeePct'>; className?: string }) {
  const t = useTranslations('customerBook');
  if (typeof fare.serviceFee !== 'number' || typeof fare.workerRate !== 'number') return null;
  return (
    <p className={`text-xs text-fy-muted ${className}`}>
      {t('feeNote', { rate: fare.workerRate, fee: fare.serviceFee, pct: fare.serviceFeePct ?? 10 })}
    </p>
  );
}
