'use client';

/**
 * Sending an actual browser notification when a booking moves.
 *
 * Asking for the permission and never using it is worse than not asking:
 * it spends the one prompt a site gets and delivers nothing, and the next
 * time something matters the customer has already learned the alerts are
 * decorative. So this is the consumer of the grant — the tracking screen
 * calls it on every status transition it observes.
 *
 * It fires only when the tab is not being looked at. A notification for a
 * change the customer can already see on the screen in front of them is
 * noise, and notification noise is what makes people revoke the permission.
 *
 * `tag` is the booking id, so a booking that moves twice replaces its own
 * notification rather than stacking a queue the customer has to dismiss
 * one by one.
 */
export function notifyBookingStatus(bookingId: string, title: string, body: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return false;
  try {
    new Notification(title, { body, tag: `fyro-booking-${bookingId}`, renotify: true } as NotificationOptions);
    return true;
  } catch {
    // Some browsers only allow notifications from a service worker
    // (Android Chrome does). Failing silently is right: this is a
    // convenience on top of a screen that already shows the same change.
    return false;
  }
}
