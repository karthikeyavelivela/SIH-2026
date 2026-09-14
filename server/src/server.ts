import http from 'http';
import { app } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';
import { initRealtime } from './realtime';
import { startScheduledBookingReleaser } from './services/scheduledBooking.service';
import { startScheduledIncentiveRunner } from './services/scheduledIncentiveRunner.service';
import { describeChain } from './agents/providers';
import { ensureTrainingModules } from './services/trainingCatalogue';

async function main() {
  await connectDb();
  const httpServer = http.createServer(app);
  initRealtime(httpServer);
  // The training curriculum is part of the app, not a manual chore. It had
  // been sitting unseeded in production — seven modules in the repo, three in
  // the database — because the seed script had never been run there.
  // Idempotent, and a failure here must never stop the server booting.
  try {
    const created = await ensureTrainingModules();
    if (created > 0) {
      // eslint-disable-next-line no-console
      console.log(`Seeded ${created} missing training module(s).`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Training module seeding failed (continuing):', err);
  }

  startScheduledBookingReleaser();
  startScheduledIncentiveRunner();
  httpServer.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`FYRO server (HTTP + Socket.io) listening on port ${env.PORT}`);
    // Which model vendor the agents will actually use. Printed once at boot
    // because "is the AI live?" was previously answerable only by reading
    // env vars on the dashboard, and a silently-mocked agent layer looks
    // identical to a working one from the outside.
    // eslint-disable-next-line no-console
    console.log(`AI agents: ${describeChain()}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
