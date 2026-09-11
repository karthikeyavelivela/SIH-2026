'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

/**
 * What a customer sees when the rating gate refuses their booking.
 *
 * The server blocks a new booking until the last completed one is rated and
 * names that booking in the error. Before this, every booking screen printed
 * the sentence and stopped — a dead end on the one screen where someone is
 * trying to spend money, with no way to reach the thing they were told to do.
 *
 * The notice now carries the two real ways out: rate it now, or rate it
 * later. Both lead to /customer/ratings, which lists everything owed and
 * offers the deferral.
 */
export function RatingGateNotice({ message, bookingId }: { message: string; bookingId: string | null }) {
  const t = useTranslations('pendingRatings');

  return (
    <div role="alert" className="rounded-card bg-fy-error-bg px-4 py-3 flex flex-col gap-3">
      <span className="font-body text-label text-fy-on-error-bg">{message}</span>
      {bookingId && (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/customer/ratings"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-fy-brown text-fy-bone font-mono text-[10px] uppercase tracking-wider font-semibold hover:bg-fy-brown-soft transition-colors"
          >
            <span aria-hidden className="material-symbols-outlined text-[15px] text-fy-lime leading-none">
              star
            </span>
            {t('rateNow')}
          </Link>
          <Link
            href="/customer/ratings"
            className="inline-flex items-center h-9 px-4 rounded-full border border-fy-on-error-bg/25 font-mono text-[10px] uppercase tracking-wider font-semibold text-fy-on-error-bg hover:bg-fy-on-error-bg/5 transition-colors"
          >
            {t('rateLater')}
          </Link>
        </div>
      )}
    </div>
  );
}
