import { User } from '../models/User';
import { HamaliProfile } from '../models/HamaliProfile';
import { Booking } from '../models/Booking';
import { Rating } from '../models/Rating';
import { Payout } from '../models/Payout';
import { Notification } from '../models/Notification';
import { ConsentRecord } from '../models/ConsentRecord';
import { AuditLog } from '../models/AuditLog';
import { publicUser } from '../utils/publicUser';
import { ApiError } from '../utils/ApiError';

/**
 * Everything FYRO holds about one person, as JSON they can keep. Their own
 * rows only (by id); other people appear as ids, never with their details.
 * Secrets (password hash, OTP hashes, claim codes) and KYC file links are
 * not included: the documents themselves stay in private storage and are
 * available to the owner through the normal signed-link flow.
 */
export async function exportMyData(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, 'User not found');
  const asWorker = { $or: [{ assignedDriverIds: user._id }, { assignedHamaliIds: user._id }] };
  const [profile, bookingsAsCustomer, bookingsAsWorker, ratingsGiven, ratingsReceived, payouts, notifications, consents, audit] = await Promise.all([
    HamaliProfile.findOne({ userId: user._id }).lean(),
    Booking.find({ customerId: user._id }).select('-completionCodeHash').lean(),
    Booking.find(asWorker).select('-completionCodeHash').lean(),
    Rating.find({ fromUserId: user._id }).lean(),
    Rating.find({ toUserId: user._id }).lean(),
    Payout.find({ userId: user._id }).lean(),
    Notification.find({ userId: user._id }).sort({ createdAt: -1 }).limit(500).lean(),
    ConsentRecord.find({ userId: user._id }).sort({ createdAt: 1 }).lean(),
    AuditLog.find({ $or: [{ actorId: user._id.toString() }, { targetType: 'User', targetId: user._id.toString() }] })
      .sort({ timestamp: -1 })
      .limit(500)
      .lean(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    account: publicUser(user),
    workerProfile: profile,
    bookingsAsCustomer,
    bookingsAsWorker,
    ratingsGiven,
    ratingsReceived,
    payouts,
    notifications,
    consents,
    activityLog: audit,
  };
}
