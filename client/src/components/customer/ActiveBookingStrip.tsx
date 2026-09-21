'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { bookingIsInMode } from '@/lib/bookingMode';
import type { CustomerMode } from '@/lib/customerMode';
import { Icon } from '@/components/ui/Icon';
import { LightCard, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel } from '@/components/fy/Text';
import { ProgressBar } from '@/components/fy/Data';

interface BookingSummary {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  serviceCategorySlug?: string;
  pickupLocation: { address: string };
  dropLocation: { address: string };
  createdAt: string;
}

const PROGRESS_STEPS = ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed'];

function shortAddress(address: string): string {
  return address.split(',')[0];
}

/**
 * "You have a job running" — on whichever mode's home it belongs to.
 *
 * This used to live only on the household home, so a customer who booked a
 * loading crew and then opened the Hamali screen saw nothing at all, while
 * the household screen showed them a job that had nothing to do with
 * household work. Switching mode is supposed to change everything on the
 * screen, and this was one of the things it was not changing.
 *
 * Renders nothing when this mode has no live booking — which is correct
 * and common. A customer with a truck in transit and nothing else should
 * see the strip in Transit and a clean Household screen.
 */
export function ActiveBookingStrip({ mode }: { mode: CustomerMode }) {
  const t = useTranslations('customerDashboard');

  const state = useApiState(
    () => api.get<{ bookings: BookingSummary[] }>('/api/bookings').then((r) => r.bookings),
    []
  );

  const active = useMemo(() => {
    const live = (state.data ?? []).filter(
      (b) => !['completed', 'cancelled'].includes(b.status) && bookingIsInMode(b, mode)
    );
    // Newest first, so a customer with two running jobs in one mode sees
    // the one they just placed rather than an older one.
    return live.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
  }, [state.data, mode]);

  if (!active) return null;

  const statusLabel: Record<string, string> = {
    scheduled: t('status.scheduled'),
    requested: t('status.requested'),
    searching: t('status.searching'),
    matched: t('status.matched'),
    accepted: t('status.accepted'),
    in_progress: t('status.in_progress'),
    completed: t('status.completed'),
    cancelled: t('status.cancelled'),
  };

  const stepIndex = PROGRESS_STEPS.indexOf(active.status);
  const progressPct = stepIndex >= 0 ? Math.round((stepIndex / (PROGRESS_STEPS.length - 1)) * 100) : 0;

  return (
    <Link href={`/customer/track/${active._id}`} className="block">
      <LightCard className="p-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fy-lime opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fy-green" />
          </span>
          <div className="flex flex-col min-w-0">
            <EyebrowLabel tone="green">{t('activeTracking')}</EyebrowLabel>
            <p className="font-body text-label text-fy-ink truncate">
              {statusLabel[active.status] ?? active.status} · {shortAddress(active.pickupLocation.address)} →{' '}
              {shortAddress(active.dropLocation.address)}
            </p>
          </div>
        </div>
        <IconTile tone="peach" size="sm" className="rounded-full">
          <Icon name="near_me" size={18} />
        </IconTile>
      </LightCard>
      <ProgressBar value={progressPct} tone="lime" className="mt-1.5 mx-1" />
    </Link>
  );
}
