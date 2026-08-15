'use client';

import { io, Socket } from 'socket.io-client';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

let socket: Socket | null = null;

/**
 * Singleton socket connection, auth'd via the same httpOnly accessToken
 * cookie every REST call already sends (withCredentials, matching api.ts's
 * credentials:'include') — never a token in JS-reachable storage. Lazily
 * created on first use so pages that never touch realtime (marketing,
 * admin CRUD) don't open a connection at all.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, { withCredentials: true, autoConnect: true });
  }
  return socket;
}
