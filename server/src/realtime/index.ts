import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { env } from '../config/env';
import { setIo, userRoom } from './io';
import { socketAuthMiddleware } from './socketAuth';
import { registerBookingHandlers } from './handlers';

export function initRealtime(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
  });

  // JWT-authenticated handshake — unauthenticated sockets never reach a
  // 'connection' handler at all (security requirement, see socketAuth.ts).
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    // Every user always has their own room, independent of any booking —
    // this is where Phase 3's pushed offers and booking:matched land
    // before/without a booking-room join.
    socket.join(userRoom(socket.data.user.id));
    registerBookingHandlers(socket);
  });

  setIo(io);
  return io;
}
