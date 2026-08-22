import http from 'http';
import { app } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';
import { initRealtime } from './realtime';
import { startScheduledBookingReleaser } from './services/scheduledBooking.service';
import { startScheduledIncentiveRunner } from './services/scheduledIncentiveRunner.service';

async function main() {
  await connectDb();
  const httpServer = http.createServer(app);
  initRealtime(httpServer);
  startScheduledBookingReleaser();
  startScheduledIncentiveRunner();
  httpServer.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`FYRO server (HTTP + Socket.io) listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
