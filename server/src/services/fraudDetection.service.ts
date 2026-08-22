import { Types } from 'mongoose';
import { FraudSignal, FraudSeverity } from '../models/FraudSignal';
import { FraudCase } from '../models/FraudCase';
import { User } from '../models/User';
import { Booking } from '../models/Booking';
import { HamaliProfile } from '../models/HamaliProfile';
import { Vehicle } from '../models/Vehicle';
import { haversineKm } from './distance.service';
import { writeAuditLog } from './audit.service';

/**
 * Phase 6 — real fraud signal detection. Every detector here runs on data
 * this codebase already collects; none fabricates a number or invents
 * evidence. Two items from the original spec list ("GPS/IP mismatch",
 * "duplicate device fingerprint") don't have an honest real-data path in
 * this environment — there is no geo-IP provider configured and no
 * client-side device fingerprinting instrumented anywhere in the app — so
 * rather than fake them, they're replaced with the closest real substitutes
 * that use data actually captured: `location_jump` (a worker's own
 * currentLocation vs. the job they just accepted) and `rapid_account_creation`
 * clustered by signup IP (a real, always-available proxy for "many accounts,
 * one source" — not literal device fingerprinting, but the same fraud
 * pattern). This divergence is documented here rather than left implicit.
 *
 * Every detector only ever creates a FraudSignal + clusters it into an open
 * FraudCase for that user — nothing here suspends an account or changes
 * accountStatus. That stays a human decision via
 * fraud.controller.ts's resolveFraudCase, exactly as the spec requires
 * ("clustered into cases, never auto-suspend").
 */

const SEVERITY_RANK: Record<FraudSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Creates a signal and clusters it into the user's one open case (or opens a new one). */
async function raiseFraudSignal(
  userId: Types.ObjectId | string,
  detectorType: string,
  severity: FraudSeverity,
  evidence: Record<string, unknown>
): Promise<void> {
  const signal = await FraudSignal.create({ userId, detectorType, severity, evidence });

  let fraudCase = await FraudCase.findOne({ userId, status: { $in: ['open', 'investigating'] } });
  if (fraudCase) {
    fraudCase.signalIds.push(signal._id);
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[fraudCase.severity]) fraudCase.severity = severity;
    await fraudCase.save();
  } else {
    fraudCase = await FraudCase.create({ userId, signalIds: [signal._id], severity, status: 'open' });
  }

  signal.caseId = fraudCase._id;
  await signal.save();

  // No human "actor" triggers a detector — same convention as
  // parametricInsurance.service.ts's auto-payout audit entries: the
  // AFFECTED user's own id+role is the actor, simpler and more honest than
  // inventing a synthetic "system" admin account.
  const subject = await User.findById(userId).select('role').lean();
  await writeAuditLog({
    actorId: userId.toString(),
    actorRole: subject?.role ?? 'customer',
    action: 'fraud_signal_detected',
    targetType: 'FraudCase',
    targetId: fraudCase._id.toString(),
    details: { detectorType, severity, evidence },
  });
}

// A booking with real distance under this is "effectively at the same
// point" — not a routing artifact, a GPS jitter floor.
const ZERO_DISTANCE_KM = 0.3;
// Below this fare a near-zero-distance job is plausible (a tiny hamali-only
// job, a cancelled-and-rebooked-at-the-same-spot job) — not worth a signal.
const SUSPICIOUS_FARE_FLOOR = 300;

/**
 * Detector 1 — zero_distance_full_fare. Run once, at booking completion
 * (see booking.controller.ts's markDelivered / hamali completion path).
 */
export async function detectZeroDistanceFullFare(bookingId: Types.ObjectId | string): Promise<void> {
  const booking = await Booking.findById(bookingId);
  if (!booking) return;
  if (booking.distanceKm === undefined || booking.distanceKm === null) return;
  if (booking.distanceKm >= ZERO_DISTANCE_KM) return;
  if (booking.fareBreakdown.total < SUSPICIOUS_FARE_FLOOR) return;

  await raiseFraudSignal(booking.customerId, 'zero_distance_full_fare', 'medium', {
    bookingId: booking._id.toString(),
    distanceKm: booking.distanceKm,
    fareTotal: booking.fareBreakdown.total,
  });
}

// Trailing window + minimum sample size — a brand-new customer with 1
// cancelled booking is noise, not a signal.
const CANCELLATION_WINDOW_DAYS = 30;
const MIN_BOOKINGS_FOR_CANCELLATION_CHECK = 5;
const HIGH_CANCELLATION_RATIO = 0.6;
const CRITICAL_CANCELLATION_RATIO = 0.85;

/**
 * Detector 2 — abnormal_cancellation_rate. Run at booking cancellation (see
 * booking.controller.ts's cancelBooking).
 */
export async function detectAbnormalCancellationRate(customerId: Types.ObjectId | string): Promise<void> {
  const since = new Date(Date.now() - CANCELLATION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const recent = await Booking.find({ customerId, createdAt: { $gte: since } }).select('status').lean();
  if (recent.length < MIN_BOOKINGS_FOR_CANCELLATION_CHECK) return;

  const cancelled = recent.filter((b) => b.status === 'cancelled').length;
  const ratio = cancelled / recent.length;
  if (ratio < HIGH_CANCELLATION_RATIO) return;

  await raiseFraudSignal(
    customerId,
    'abnormal_cancellation_rate',
    ratio >= CRITICAL_CANCELLATION_RATIO ? 'high' : 'medium',
    { windowDays: CANCELLATION_WINDOW_DAYS, totalBookings: recent.length, cancelled, ratio: Number(ratio.toFixed(2)) }
  );
}

// How many accounts from one IP inside the window counts as suspicious.
const RAPID_SIGNUP_WINDOW_HOURS = 24;
const RAPID_SIGNUP_THRESHOLD = 3;

/**
 * Detector 3 — rapid_account_creation, clustered by signup IP (see this
 * file's header comment for why IP rather than a device fingerprint). Run
 * once, right after a new User is created (see auth.controller.ts's signup).
 */
export async function detectRapidAccountCreation(newUserId: Types.ObjectId | string, signupIp: string | undefined): Promise<void> {
  if (!signupIp) return;
  const since = new Date(Date.now() - RAPID_SIGNUP_WINDOW_HOURS * 60 * 60 * 1000);
  const recentAccounts = await User.find({ signupIp, createdAt: { $gte: since } }).select('_id').lean();
  if (recentAccounts.length < RAPID_SIGNUP_THRESHOLD) return;

  await raiseFraudSignal(newUserId, 'rapid_account_creation', recentAccounts.length >= 5 ? 'high' : 'medium', {
    signupIp,
    windowHours: RAPID_SIGNUP_WINDOW_HOURS,
    accountsFromThisIp: recentAccounts.length,
  });
}

// A worker's own last-known location this far from a job they just accepted
// isn't a routing question (matching.service.ts already bounds search
// radius) — it means the location on file is stale or spoofed.
const LOCATION_JUMP_KM = 80;

/**
 * Detector 4 (real substitute for "GPS/IP mismatch") — location_jump. Run
 * at accept time (see bookingAssignment.service.ts's acceptAsDriver /
 * acceptAsHamali).
 */
export async function detectLocationJump(
  workerId: Types.ObjectId | string,
  role: 'driver' | 'hamali_solo' | 'mutha_member',
  pickup: { lat: number; lng: number }
): Promise<void> {
  const currentLocation =
    role === 'driver'
      ? (await Vehicle.findOne({ ownerId: workerId }).select('currentLocation').lean())?.currentLocation
      : (await HamaliProfile.findOne({ userId: workerId }).select('currentLocation').lean())?.currentLocation;
  if (!currentLocation?.coordinates) return;

  const [lng, lat] = currentLocation.coordinates;
  if (lat === 0 && lng === 0) return; // unset default, not a real position
  const distanceKm = haversineKm({ lat, lng }, pickup);
  if (distanceKm < LOCATION_JUMP_KM) return;

  await raiseFraudSignal(workerId, 'location_jump', distanceKm > 300 ? 'high' : 'medium', {
    distanceKm: Number(distanceKm.toFixed(1)),
    workerLocation: { lat, lng },
    jobPickup: pickup,
  });
}
