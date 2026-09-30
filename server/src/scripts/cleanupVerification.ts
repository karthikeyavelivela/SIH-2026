import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import { Booking } from '../models/Booking';
import { ChatMessage } from '../models/ChatMessage';
import { Rating } from '../models/Rating';

/**
 * C0 — removes the bookings made by verification accounts, with their chat
 * messages and ratings.
 *
 *   npx ts-node src/scripts/cleanupVerification.ts           # dry run: counts only
 *   npx ts-node src/scripts/cleanupVerification.ts --apply   # deletes
 *
 * The ledger, payments and audit log are append-only and are NOT touched:
 * they keep the record of what the verification run did. The verification
 * accounts themselves stay, so the run can be repeated.
 */
async function main() {
  const apply = process.argv.includes('--apply');
  await connectDb();
  try {
    const ids = (await Booking.find({ isVerification: true }).select('_id').lean()).map((b) => b._id);
    const chats = await ChatMessage.countDocuments({ bookingId: { $in: ids } });
    const ratings = await Rating.countDocuments({ bookingId: { $in: ids } });
    // eslint-disable-next-line no-console
    console.log(`${apply ? 'DELETING' : 'DRY RUN — would delete'}: ${ids.length} booking(s), ${chats} chat message(s), ${ratings} rating(s).`);
    if (apply && ids.length > 0) {
      await ChatMessage.deleteMany({ bookingId: { $in: ids } });
      await Rating.deleteMany({ bookingId: { $in: ids } });
      await Booking.deleteMany({ _id: { $in: ids } });
      // eslint-disable-next-line no-console
      console.log('Done.');
    } else if (!apply) {
      // eslint-disable-next-line no-console
      console.log('Re-run with --apply to delete.');
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('cleanupVerification failed:', err);
  process.exit(1);
});
