'use client';

import { io, Socket } from 'socket.io-client';
import { api } from '@/lib/api';

/*
 * The socket is the one connection that cannot go through this site's /api
 * rewrite — Vercel proxies HTTP, not WebSockets — so it still connects to
 * Render directly.
 *
 * It used to authenticate with the session cookie, which only worked while
 * that cookie belonged to Render's domain. The cookie now belongs to this
 * site (that is the login fix for iPhones), so the socket fetches a
 * short-lived, socket-only token over the same-origin API and presents it in
 * the handshake instead. `auth` is a function so a reconnect after the token
 * has expired asks for a fresh one rather than replaying a dead one.
 */
const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
      auth: (cb) => {
        api
          .post<{ token: string }>('/api/auth/socket-token')
          .then((r) => cb({ token: r.token }))
          // No token: connect anyway and let the server refuse. The page's
          // polling fallback keeps it correct until the next reconnect.
          .catch(() => cb({}));
      },
    });
  }
  return socket;
}
