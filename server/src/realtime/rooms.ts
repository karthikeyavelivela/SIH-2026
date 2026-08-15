import { Booking, IBooking } from '../models/Booking';
import { Mutha } from '../models/Mutha';
import type { SocketUser } from './socketAuth';

/**
 * The single authorization check for "may this user join booking:{id}".
 * Security requirement: "validate that a user requesting to join a booking
 * room actually owns/is-assigned-to that booking before allowing the join
 * — no open rooms." Re-derives membership from the DB on every join call
 * (never trusts a client-supplied claim), same IDOR discipline as every
 * REST route in this codebase.
 */
export async function canJoinBookingRoom(user: SocketUser, booking: IBooking): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'manager') return true;
  if (booking.customerId.toString() === user.id) return true;
  if (booking.assignedDriverIds.some((id) => id.toString() === user.id)) return true;
  if (booking.assignedHamaliIds.some((id) => id.toString() === user.id)) return true;

  if (user.role === 'mutha_leader' && booking.assignedMuthaId) {
    const mutha = await Mutha.findOne({ leaderId: user.id });
    if (mutha && mutha._id.toString() === booking.assignedMuthaId.toString()) return true;
  }

  return false;
}

export async function loadBookingForAuth(bookingId: string): Promise<IBooking | null> {
  return Booking.findById(bookingId);
}
