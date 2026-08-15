import { Socket } from 'socket.io';
import { parse as parseCookie } from 'cookie';
import { verifyAccessToken } from '../services/token.service';
import type { Role } from '@fyro/shared';

export interface SocketUser {
  id: string;
  role: Role;
}

declare module 'socket.io' {
  // Officially-supported extension point for per-socket `data` (see
  // socket.io's own generics docs) — augmenting `Socket` directly instead
  // conflicts with its generic `data: SocketData` property.
  interface SocketData {
    user: SocketUser;
  }
}

/**
 * JWT-authenticated handshake — mirrors verifyJwt's HTTP middleware exactly
 * (same accessToken httpOnly cookie, same verify call), because the
 * security requirement is "authenticate the JWT on connection handshake,
 * reject unauthenticated sockets" — there is no separate/weaker auth path
 * for realtime. A socket that fails this never reaches any event handler:
 * `next(new Error(...))` here rejects the connection outright.
 */
export function socketAuthMiddleware(socket: Socket, next: (err?: Error) => void): void {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    if (!cookieHeader) {
      next(new Error('Not authenticated'));
      return;
    }
    const cookies = parseCookie(cookieHeader);
    const token = cookies.accessToken;
    if (!token) {
      next(new Error('Not authenticated'));
      return;
    }
    const payload = verifyAccessToken(token);
    socket.data.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
