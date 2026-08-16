import { IBooking } from '../models/Booking';
import { User } from '../models/User';
import { Vehicle } from '../models/Vehicle';
import { Mutha } from '../models/Mutha';
import { tryGetIo, bookingRoom, userRoom } from './io';

/**
 * booking:matched — pushed to the customer the instant a booking becomes
 * fully staffed (status -> 'accepted'), carrying "the assigned party's
 * profile, vehicle/skill info, and rating" per spec. Fires from BOTH accept
 * paths (a worker browsing the open list, and Phase 3's pushed-offer
 * accept) since both call the same bookingAssignment.service functions —
 * this is called once, right after that shared write, regardless of which
 * channel triggered it.
 *
 * Best-effort: if no socket server is running (every existing Jest test),
 * tryGetIo() returns null and this is a silent no-op — the booking write
 * already happened and is authoritative; a connected client that missed
 * this falls back to its next poll.
 */
export async function emitBookingMatched(booking: IBooking): Promise<void> {
  if (booking.status !== 'accepted') return; // only fire once fully staffed
  const io = tryGetIo();
  if (!io) return;

  const assigned: Record<string, unknown> = {};

  // Masked contact: raw phone numbers are never sent to the other party —
  // no telephony/SMS-proxy vendor is integrated in this codebase, and
  // shipping a fake "masked call" button that silently exposed the real
  // number would be worse than not having calling at all. The in-app
  // ChatPanel (already present on both the customer's track page and the
  // worker's active-job page) is the one contact channel that's actually
  // safe to offer, so `phone` is deliberately excluded from this payload —
  // this was previously leaking the raw number straight to `tel:` links.
  if (booking.assignedDriverIds.length > 0) {
    const driverId = booking.assignedDriverIds[0].toString();
    const [driver, vehicle] = await Promise.all([
      User.findById(driverId).select('name ratingAvg ratingCount').lean(),
      Vehicle.findOne({ ownerId: driverId }).select('type capacityKg registrationNumber').lean(),
    ]);
    if (driver) {
      assigned.driver = {
        id: driverId,
        name: driver.name,
        ratingAvg: driver.ratingAvg,
        ratingCount: driver.ratingCount,
        vehicle,
      };
    }
  }

  if (booking.assignedMuthaId) {
    const mutha = await Mutha.findById(booking.assignedMuthaId).select('name ratingAvg ratingCount').lean();
    if (mutha) {
      assigned.mutha = { id: mutha._id.toString(), name: mutha.name, ratingAvg: mutha.ratingAvg, ratingCount: mutha.ratingCount };
    }
  } else if (booking.assignedHamaliIds.length > 0) {
    const hamalis = await User.find({ _id: { $in: booking.assignedHamaliIds } })
      .select('name ratingAvg ratingCount')
      .lean();
    assigned.hamalis = hamalis.map((h) => ({
      id: h._id.toString(),
      name: h.name,
      ratingAvg: h.ratingAvg,
      ratingCount: h.ratingCount,
    }));
  }

  io.to(userRoom(booking.customerId.toString())).emit('booking:matched', {
    bookingId: booking._id.toString(),
    status: booking.status,
    assigned,
  });
}

/** Generic status-change push (start/complete/cancel) to everyone already in the booking room. */
export function emitBookingStatus(booking: IBooking): void {
  const io = tryGetIo();
  if (!io) return;
  io.to(bookingRoom(booking._id.toString())).emit('booking:status', {
    bookingId: booking._id.toString(),
    status: booking.status,
    statusHistory: booking.statusHistory,
  });
}

/** Pushed to a single candidate — Phase 3's exclusive timed offer. */
export function emitBookingOffer(
  candidateUserId: string,
  payload: { bookingId: string; type: string; pickupAddress: string; dropAddress: string; distanceKm: number; total: number; expiresAt: number }
): void {
  const io = tryGetIo();
  if (!io) return;
  io.to(userRoom(candidateUserId)).emit('booking:offer', payload);
}

/** Tells a candidate's client their offer expired/was withdrawn (e.g. someone else took it, or their timer ran out server-side). */
export function emitOfferClosed(candidateUserId: string, bookingId: string, reason: 'timeout' | 'taken' | 'rejected'): void {
  const io = tryGetIo();
  if (!io) return;
  io.to(userRoom(candidateUserId)).emit('booking:offer_closed', { bookingId, reason });
}
