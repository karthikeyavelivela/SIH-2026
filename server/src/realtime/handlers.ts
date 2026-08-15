import { Socket } from 'socket.io';
import { Booking } from '../models/Booking';
import { ChatMessage } from '../models/ChatMessage';
import { User } from '../models/User';
import { canJoinBookingRoom, loadBookingForAuth } from './rooms';
import { bookingRoom, getIo } from './io';
import {
  respondToVehicleOffer,
  respondToHamaliOffer,
  respondToMuthaHamaliOffer,
} from './offerEngine';

const LOCATION_MIN_INTERVAL_MS = 4000; // server-side floor under the client's own 5-10s throttle
const lastLocationAt = new Map<string, number>(); // socket.id -> timestamp

export function registerBookingHandlers(socket: Socket): void {
  const user = socket.data.user;

  // ---- Join / leave ----
  socket.on('booking:join', async (payload: { bookingId?: string }, ack?: (res: { ok: boolean; error?: string }) => void) => {
    const bookingId = payload?.bookingId;
    if (!bookingId) {
      ack?.({ ok: false, error: 'bookingId is required' });
      return;
    }
    const booking = await loadBookingForAuth(bookingId);
    if (!booking) {
      ack?.({ ok: false, error: 'Booking not found' });
      return;
    }
    // Server-side re-derivation of membership, never trusting the client's
    // claim that it "should" be allowed to join — the exact requirement
    // from the security spec ("validate... before allowing the join").
    const allowed = await canJoinBookingRoom(user, booking);
    if (!allowed) {
      ack?.({ ok: false, error: 'Forbidden' });
      return;
    }
    socket.join(bookingRoom(bookingId));

    // Send recent chat history on join so a refresh/reconnect isn't blank.
    const history = await ChatMessage.find({ bookingId }).sort({ createdAt: 1 }).limit(200).lean();
    socket.emit('booking:chat_history', {
      bookingId,
      messages: history.map((m) => ({
        id: m._id.toString(),
        senderId: m.senderId.toString(),
        senderRole: m.senderRole,
        text: m.text,
        createdAt: m.createdAt,
      })),
    });
    ack?.({ ok: true });
  });

  socket.on('booking:leave', (payload: { bookingId?: string }) => {
    if (payload?.bookingId) socket.leave(bookingRoom(payload.bookingId));
  });

  // ---- Sequential-offer response ----
  socket.on(
    'booking:offer_response',
    async (payload: { bookingId?: string; accept?: boolean }, ack?: (res: { ok: boolean; error?: string }) => void) => {
      const { bookingId, accept } = payload ?? {};
      if (!bookingId || typeof accept !== 'boolean') {
        ack?.({ ok: false, error: 'bookingId and accept are required' });
        return;
      }
      try {
        if (user.role === 'driver') {
          await respondToVehicleOffer(bookingId, user.id, accept);
        } else if (user.role === 'hamali_solo') {
          await respondToHamaliOffer(bookingId, user.id, accept);
        } else if (user.role === 'mutha_leader') {
          await respondToMuthaHamaliOffer(bookingId, user.id, accept);
        } else {
          ack?.({ ok: false, error: 'This role does not receive offers' });
          return;
        }
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : 'Could not respond to offer' });
      }
    }
  );

  // ---- Live location (driver/hamali/mutha_leader while in_progress) ----
  socket.on('booking:location', async (payload: { bookingId?: string; lat?: number; lng?: number }) => {
    const { bookingId, lat, lng } = payload ?? {};
    if (!bookingId || typeof lat !== 'number' || typeof lng !== 'number') return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    const now = Date.now();
    const last = lastLocationAt.get(socket.id) ?? 0;
    if (now - last < LOCATION_MIN_INTERVAL_MS) return; // server-side floor against a runaway/malicious client
    lastLocationAt.set(socket.id, now);

    const booking = await Booking.findById(bookingId).select('status assignedDriverIds assignedHamaliIds assignedMuthaId');
    if (!booking || booking.status !== 'in_progress') return;

    const isAssigned =
      booking.assignedDriverIds.some((id) => id.toString() === user.id) ||
      booking.assignedHamaliIds.some((id) => id.toString() === user.id);
    // mutha_leader isn't individually "assigned" (their members are) but is
    // the one holding the phone doing the driving/coordinating for a group
    // job in practice — allow them too, scoped to their own group's booking.
    let isMuthaLeaderOfThisJob = false;
    if (!isAssigned && user.role === 'mutha_leader' && booking.assignedMuthaId) {
      const { Mutha } = await import('../models/Mutha');
      const mutha = await Mutha.findOne({ leaderId: user.id }).select('_id').lean();
      isMuthaLeaderOfThisJob = !!mutha && mutha._id.toString() === booking.assignedMuthaId.toString();
    }
    if (!isAssigned && !isMuthaLeaderOfThisJob) return;

    getIo().to(bookingRoom(bookingId)).emit('booking:location_update', { bookingId, lat, lng, at: now });
  });

  // ---- Chat ----
  socket.on('booking:chat_message', async (payload: { bookingId?: string; text?: string }) => {
    const { bookingId, text } = payload ?? {};
    if (!bookingId || !text || !text.trim()) return;
    if (!socket.rooms.has(bookingRoom(bookingId))) return; // must have joined (and been authorized) first

    const trimmed = text.trim().slice(0, 2000);
    const message = await ChatMessage.create({
      bookingId,
      senderId: user.id,
      senderRole: user.role,
      text: trimmed,
    });
    const sender = await User.findById(user.id).select('name').lean();

    getIo().to(bookingRoom(bookingId)).emit('booking:chat_message', {
      bookingId,
      id: message._id.toString(),
      senderId: user.id,
      senderRole: user.role,
      senderName: sender?.name ?? 'Unknown',
      text: trimmed,
      createdAt: message.createdAt,
    });
  });

  socket.on('disconnect', () => {
    lastLocationAt.delete(socket.id);
  });
}
