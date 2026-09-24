import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { JwtAccessPayload, JwtRefreshPayload } from '@fyro/shared';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
export const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;

export function signAccessToken(payload: JwtAccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

export function signRefreshToken(payload: JwtRefreshPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_TTL });
}

export function verifyAccessToken(token: string): JwtAccessPayload {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtAccessPayload & { aud?: string };
  // A socket token is signed with the same secret but is not a session. It
  // is handed to JavaScript, so it must never work as the httpOnly cookie
  // it deliberately is not.
  if (payload.aud === SOCKET_AUDIENCE) throw new Error('Socket token is not an access token');
  return payload;
}

/*
 * The realtime handshake's credential.
 *
 * The socket connects to this server directly while the session cookie now
 * belongs to the web origin that proxies the REST API, so the cookie never
 * reaches the handshake. The client fetches one of these over the proxied
 * (cookie-authenticated) API and presents it instead.
 *
 * Deliberately weak in every way that matters: readable by JavaScript, so
 * it lives two minutes, is only valid for the handshake, and is rejected
 * everywhere else by the audience check above.
 */
const SOCKET_AUDIENCE = 'socket';
const SOCKET_TOKEN_TTL = '2m';

export function signSocketToken(payload: { id: string; role: JwtAccessPayload['role'] }): string {
  return jwt.sign({ id: payload.id, role: payload.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: SOCKET_TOKEN_TTL,
    audience: SOCKET_AUDIENCE,
  });
}

export function verifySocketToken(token: string): { id: string; role: JwtAccessPayload['role'] } {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { audience: SOCKET_AUDIENCE }) as {
    id: string;
    role: JwtAccessPayload['role'];
  };
}

export function verifyRefreshToken(token: string): JwtRefreshPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtRefreshPayload;
}
