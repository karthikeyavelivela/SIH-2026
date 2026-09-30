import { ActivityDay } from '../models/ActivityDay';
import { User } from '../models/User';

export function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Records that a worker was available today. Idempotent (one row per day)
 * and never allowed to fail the request that triggered it.
 */
export async function markAvailableToday(userId: string, at: Date = new Date()): Promise<void> {
  try {
    const user = await User.findById(userId).select('region isVerification').lean();
    if (!user || (user as { isVerification?: boolean }).isVerification) return;
    await ActivityDay.updateOne(
      { userId, day: dayKey(at) },
      { $setOnInsert: { userId, day: dayKey(at), region: user.region } },
      { upsert: true }
    );
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return;
    // eslint-disable-next-line no-console
    console.error('markAvailableToday failed:', err);
  }
}
