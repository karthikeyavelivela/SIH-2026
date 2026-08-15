import { Server as SocketIOServer } from 'socket.io';

// Module-level singleton, set once by initRealtime() at server boot. Every
// controller that needs to push an event (matching, status transitions)
// imports getIo() rather than threading the instance through every function
// signature — same pattern as this codebase's other app-wide singletons
// (mongoose connection, express app).
let io: SocketIOServer | null = null;

export function setIo(instance: SocketIOServer): void {
  io = instance;
}

export function getIo(): SocketIOServer {
  if (!io) throw new Error('Socket.io not initialized — initRealtime() must run before any getIo() call');
  return io;
}

/**
 * Non-throwing accessor for call sites (controllers, emitters) that run in
 * contexts where a socket server may legitimately not exist — every
 * existing Jest test hits these same controllers over plain HTTP with no
 * socket layer running at all. Emitting a real-time event is inherently
 * best-effort from an HTTP request handler's point of view: the write to
 * MongoDB already succeeded and is the source of truth: a missed/skipped
 * push just means a connected client falls back to its next poll.
 */
export function tryGetIo(): SocketIOServer | null {
  return io;
}

/** Room a single user always has (independent of any booking) — used to push offers/notifications before a booking room membership exists. */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function bookingRoom(bookingId: string): string {
  return `booking:${bookingId}`;
}
