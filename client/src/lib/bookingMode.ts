import type { CustomerMode } from './customerMode';

/**
 * Which of the three worlds a booking belongs to.
 *
 * This existed inline on the history screen and was wrong. The rule there
 * read `serviceCategorySlug === 'general_labour' || type === 'hamali'` →
 * Hamali — but EVERY household trade dispatches as `type: 'hamali'`. A
 * plumber booking is `{ type: 'hamali', serviceCategorySlug: 'plumber' }`,
 * so every household job in a customer's history filed itself under the
 * Hamali filter and the Household filter was permanently empty.
 *
 * The category slug is the discriminator, and the dispatch type is only
 * the fallback for rows that predate it:
 *
 *   general_labour     -> Hamali. The loading-crew category itself.
 *   general_logistics  -> Transit.
 *   truck or combo     -> Transit. A combo carries a vehicle, and the
 *                         customer who booked it was moving goods.
 *   no slug + hamali   -> Hamali. Bookings placed before the category
 *                         field existed came from the crew screen.
 *   anything else      -> Household. A named trade.
 */
export interface ModeBookingShape {
  type: 'truck' | 'hamali' | 'combo';
  serviceCategorySlug?: string;
}

export function bookingMode(booking: ModeBookingShape): CustomerMode {
  const slug = booking.serviceCategorySlug;
  if (slug === 'general_labour' || slug === 'agri_labour') return 'labour';
  if (slug === 'general_logistics') return 'transport';
  if (booking.type === 'truck' || booking.type === 'combo') return 'transport';
  if (!slug && booking.type === 'hamali') return 'labour';
  return 'household';
}

/** True when this booking belongs on the given mode's screens. */
export function bookingIsInMode(booking: ModeBookingShape, mode: CustomerMode): boolean {
  return bookingMode(booking) === mode;
}
