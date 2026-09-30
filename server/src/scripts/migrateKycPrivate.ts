import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { migrateKycToPrivate } from '../services/kycMigration.service';

/**
 * Moves publicly stored KYC documents to private Cloudinary storage.
 *
 *   npx ts-node src/scripts/migrateKycPrivate.ts           # dry run: lists what it would move
 *   npx ts-node src/scripts/migrateKycPrivate.ts --apply   # copies, re-points, deletes the public copy, audits
 *
 * Needs MONGODB_URI and CLOUDINARY_* for the target environment, and
 * MOCK_UPLOADS=false. Safe to re-run: private documents are skipped.
 */
async function main() {
  const apply = process.argv.includes('--apply');
  await connectDb();
  try {
    const items = await migrateKycToPrivate({ apply });
    const count = (a: string) => items.filter((i) => i.action === a).length;
    for (const i of items) {
      // eslint-disable-next-line no-console
      console.log(`${i.action.padEnd(20)} user=${i.userId} doc=${i.documentId} type=${i.type}${i.reason ? `  (${i.reason})` : ''}`);
    }
    // eslint-disable-next-line no-console
    console.log(
      `\n${apply ? 'APPLIED' : 'DRY RUN'}: ${apply ? count('migrated') : count('would_migrate')} to move, ` +
        `${count('skipped_unfetchable')} skipped, ${count('failed')} failed.` +
        (apply ? '' : '\nRe-run with --apply to perform it.')
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('migrateKycPrivate failed:', err);
  process.exit(1);
});
