import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { ensureTrainingModules } from '../services/trainingCatalogue';

// The curriculum itself now lives in services/trainingCatalogue.ts, because
// the app seeds it at boot — production had gone live with three of the
// seven modules purely because this script had never been run there. This
// remains as the manual entry point.

async function seedTrainingModules() {
  await connectDb();
  const created = await ensureTrainingModules();
  // eslint-disable-next-line no-console
  console.log(created === 0 ? 'Training modules already seeded.' : `Seeded ${created} training module(s).`);
  await mongoose.disconnect();
}

seedTrainingModules().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedTrainingModules failed:', err);
  process.exit(1);
});
