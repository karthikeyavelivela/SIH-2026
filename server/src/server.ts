import { app } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

async function main() {
  await connectDb();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`FYRO server listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
