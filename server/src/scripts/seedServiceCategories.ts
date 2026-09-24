import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { ensureServiceCategories } from '../services/serviceCategorySeed';

// The table lives in services/serviceCategorySeed.ts, which the server also
// runs at boot; this script remains for seeding a database by hand.
async function seedServiceCategories() {
  await connectDb();
  try {
    const created = await ensureServiceCategories();
    // eslint-disable-next-line no-console
    console.log(`Seeded ${created} missing service categor${created === 1 ? 'y' : 'ies'}.`);
  } finally {
    await mongoose.disconnect();
  }
}

seedServiceCategories().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seedServiceCategories failed:', err);
  process.exit(1);
});
