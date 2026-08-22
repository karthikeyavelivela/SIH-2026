import { Booking } from '../models/Booking';
import { startVehicleOffers, startHamaliOffers } from '../realtime/offerEngine';

/**
 * Phase 6 — scheduled (vs. instant) booking. A scheduled booking sits in
 * status 'scheduled' from creation until its `scheduledFor` time arrives;
 * this loop is what actually releases it into the exact same matching path
 * an instant booking gets (booking.controller.ts's createBooking) — no
 * separate/lesser matching logic for scheduled jobs.
 *
 * server.ts is a persistent Node process (not a serverless function), so a
 * plain setInterval poll is consistent with how this codebase already
 * handles the one other "eventually, in the background" concern
 * (Phase 3's offer-engine timers) — no new job-queue infrastructure
 * (Bull/Agenda/cron) is justified for one polling loop.
 */
const POLL_INTERVAL_MS = 60_000;

export async function releaseDueScheduledBookings(now: Date = new Date()): Promise<number> {
  const due = await Booking.find({ status: 'scheduled', scheduledFor: { $lte: now } });
  for (const booking of due) {
    booking.status = 'searching';
    booking.statusHistory.push({ status: 'searching', timestamp: now });
    await booking.save();

    if (booking.type === 'truck' || booking.type === 'combo') {
      startVehicleOffers(booking).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('startVehicleOffers failed (scheduled release):', err);
      });
    }
    if (booking.type === 'hamali' || booking.type === 'combo') {
      startHamaliOffers(booking).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('startHamaliOffers failed (scheduled release):', err);
      });
    }
  }
  return due.length;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Called once from server.ts's bootstrap — never from app.ts, so importing app.ts in tests never starts a real timer. */
export function startScheduledBookingReleaser(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    releaseDueScheduledBookings().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('releaseDueScheduledBookings failed:', err);
    });
  }, POLL_INTERVAL_MS);
  intervalHandle.unref?.(); // never keeps the process alive on its own
}

export function stopScheduledBookingReleaser(): void {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = null;
}
