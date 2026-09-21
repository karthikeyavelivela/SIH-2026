import { Booking } from '../models/Booking';

/**
 * Which of the customer's three modes a notification belongs to.
 *
 * Switching mode is meant to change everything on screen, and the
 * notification list was the last thing that ignored it — a customer in
 * Hamali mode still saw alerts about a truck in transit.
 *
 * DERIVED, NOT STORED
 *
 * A `mode` column on Notification would have meant touching all fifteen
 * call sites, each of which would have to know the booking's mode, plus a
 * backfill for every row already written. The link already carries the
 * booking id — every booking notification points at a tracking or active-
 * job screen — so the mode is recoverable from data that is already there,
 * with one extra query on one list endpoint.
 *
 * A notification with no booking behind it (a KYC decision, a payout, a
 * policy change) has NO mode and appears in every mode. That is deliberate:
 * "your document was rejected" is not about household work or transit, and
 * hiding it behind a mode switch would be the kind of quiet loss this
 * scoping is otherwise careful to avoid.
 */

export type NotificationMode = 'household' | 'labour' | 'transport';

/** Any path ending in a 24-character hex id: /customer/track/<id>, /driver/active-job/<id>. */
const BOOKING_ID_IN_LINK = /\/([0-9a-f]{24})(?:[/?#]|$)/i;

export function bookingIdFromLink(link?: string): string | null {
  if (!link) return null;
  const match = BOOKING_ID_IN_LINK.exec(link);
  return match ? match[1] : null;
}

/**
 * The same rule the client uses (lib/bookingMode.ts), and for the same
 * reason: the category slug decides it, because every household trade
 * dispatches as `type: 'hamali'` and the dispatch type alone would file a
 * plumber under the loading crew.
 */
export function modeForBooking(booking: { type: string; serviceCategorySlug?: string }): NotificationMode {
  const slug = booking.serviceCategorySlug;
  if (slug === 'general_labour') return 'labour';
  if (slug === 'general_logistics') return 'transport';
  if (booking.type === 'truck' || booking.type === 'combo') return 'transport';
  if (!slug && booking.type === 'hamali') return 'labour';
  return 'household';
}

/**
 * Resolves the mode of every notification in one query.
 *
 * Returns a map from notification id to mode; an id that is absent has no
 * booking behind it and belongs to every mode.
 */
export async function modesForNotifications(
  rows: { _id: unknown; link?: string }[]
): Promise<Map<string, NotificationMode>> {
  const byBooking = new Map<string, string[]>();
  for (const row of rows) {
    const bookingId = bookingIdFromLink(row.link);
    if (!bookingId) continue;
    const list = byBooking.get(bookingId) ?? [];
    list.push(String(row._id));
    byBooking.set(bookingId, list);
  }
  if (byBooking.size === 0) return new Map();

  const bookings = await Booking.find({ _id: { $in: [...byBooking.keys()] } })
    .select('type serviceCategorySlug')
    .lean();

  const out = new Map<string, NotificationMode>();
  for (const booking of bookings) {
    const mode = modeForBooking(booking as { type: string; serviceCategorySlug?: string });
    for (const notificationId of byBooking.get(String(booking._id)) ?? []) {
      out.set(notificationId, mode);
    }
  }
  return out;
}
