import crypto from 'crypto';
import { Booking, IBooking } from '../models/Booking';
import { Dispute } from '../models/Dispute';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { env } from '../config/env';
import { emitBookingStatus } from '../realtime/emitters';
import { writeAuditLog, SYSTEM_ACTOR_ID } from './audit.service';
import { detectZeroDistanceFullFare } from './fraudDetection.service';
import { recordSocietyDeductionsForBooking } from './governance.service';
import { recordPlatformCommissionForBooking } from './platformCommission.service';
import { settleServiceFee } from './serviceFee.service';
import { settleRework } from './guarantee.service';
import type { HydratedDocument } from 'mongoose';

/**
 * Customer-confirmed completion.
 *
 * A worker saying "done" used to settle the job: status went straight to
 * 'completed', and earnings, commission, the ledger, the guarantee window
 * and the rating gate all followed. The customer had no say. Now:
 *
 *   start          -> a 4-digit code is generated; only the customer sees it
 *   worker + code  -> 'completed' at once (the customer handed it over, so
 *                     they were there and satisfied); needs a delivery photo
 *   worker, no code -> 'awaiting_confirmation'
 *   customer "Confirm job done"            -> 'completed'
 *   customer "Report a problem"            -> dispute; settlement held
 *   nothing for AUTO_CONFIRM_HOURS, no open dispute -> 'completed' (audited)
 *
 * finalizeCompletion below is the ONLY code that moves a booking to
 * 'completed', so everything that settles money hangs off one place.
 */

export const MAX_CODE_ATTEMPTS = 5;
const ACTIVE_DISPUTE = ['open', 'investigating', 'escalated'];

function key(): Buffer {
  return crypto.createHash('sha256').update(`${env.JWT_ACCESS_SECRET}:completion-code`).digest();
}

function hashCode(bookingId: string, code: string): string {
  return crypto.createHmac('sha256', key()).update(`${bookingId}:${code}`).digest('hex');
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), ct].map((b) => b.toString('base64')).join('.');
}

function decrypt(stored: string): string | null {
  try {
    const [iv, tag, ct] = stored.split('.').map((p) => Buffer.from(p, 'base64'));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Sets a fresh code on the (unsaved) booking document and returns it. */
export function assignCompletionCode(booking: HydratedDocument<IBooking>): string {
  const code = crypto.randomInt(0, 10_000).toString().padStart(4, '0');
  booking.completionCodeHash = hashCode(booking._id.toString(), code);
  booking.completionCodeCipher = encrypt(code);
  booking.completionCodeAttempts = 0;
  return code;
}

/** The plain code, for the customer's own view of their booking. */
export async function revealCompletionCode(bookingId: string): Promise<string | null> {
  const b = await Booking.findById(bookingId).select('+completionCodeCipher status').lean();
  if (!b?.completionCodeCipher || b.status !== 'in_progress') return null;
  return decrypt(b.completionCodeCipher);
}

/**
 * Checks a code a worker entered. Wrong answers count; after
 * MAX_CODE_ATTEMPTS the code stops working and the job can only finish
 * through the customer's confirmation — a 4-digit code must not be
 * guessable by retrying.
 */
export async function checkCompletionCode(bookingId: string, code: string): Promise<'ok' | 'wrong' | 'locked'> {
  const b = await Booking.findById(bookingId).select('+completionCodeHash completionCodeAttempts').lean();
  if (!b?.completionCodeHash) return 'locked';
  if ((b.completionCodeAttempts ?? 0) >= MAX_CODE_ATTEMPTS) return 'locked';
  const expected = b.completionCodeHash;
  const got = hashCode(bookingId, code.trim());
  const ok = expected.length === got.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  if (ok) return 'ok';
  await Booking.updateOne({ _id: bookingId }, { $inc: { completionCodeAttempts: 1 } });
  return (b.completionCodeAttempts ?? 0) + 1 >= MAX_CODE_ATTEMPTS ? 'locked' : 'wrong';
}

async function freeWorkers(booking: IBooking): Promise<void> {
  if (booking.assignedDriverIds.length > 0) {
    await Vehicle.updateMany({ ownerId: { $in: booking.assignedDriverIds } }, { availabilityStatus: 'online' });
  }
  if (booking.assignedHamaliIds.length > 0) {
    await HamaliProfile.updateMany({ userId: { $in: booking.assignedHamaliIds } }, { availabilityStatus: 'online' });
  }
}

/**
 * The worker has finished; the customer has not confirmed. The worker is
 * free for the next job — the work is done — but nothing is settled.
 */
export async function markWorkDone(booking: HydratedDocument<IBooking>): Promise<HydratedDocument<IBooking>> {
  booking.status = 'awaiting_confirmation';
  booking.workDoneAt = new Date();
  booking.statusHistory.push({ status: 'awaiting_confirmation', timestamp: new Date() });
  await booking.save();
  await freeWorkers(booking);
  emitBookingStatus(booking);
  return booking;
}

/**
 * The one transition to 'completed', and everything that follows from it.
 * Conditional on the booking still being in a finishable state, so two
 * paths racing (customer confirms as the auto-confirm fires) settle once.
 */
export async function finalizeCompletion(
  bookingId: string,
  via: 'code' | 'customer' | 'auto',
  actor: { id: string; role: string }
): Promise<HydratedDocument<IBooking> | null> {
  const now = new Date();
  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: { $in: ['in_progress', 'awaiting_confirmation'] }, settlementHeld: { $ne: true } },
    {
      status: 'completed',
      completedVia: via,
      $push: { statusHistory: { status: 'completed', timestamp: now } },
      $unset: { completionCodeHash: 1, completionCodeCipher: 1 },
    },
    { new: true }
  );
  if (!booking) return null;
  if (!booking.workDoneAt) {
    booking.workDoneAt = now;
    await booking.save();
  }

  await freeWorkers(booking);
  detectZeroDistanceFullFare(booking._id.toString()).catch(() => {});
  // Settlement. Awaited (not fire-and-forget) so a caller that returns
  // 'completed' has actually settled; each writer is itself idempotent.
  // P1.1: a booking priced with the service fee posts its four fee parts and
  // deducts nothing from the worker; the two old writers below skip it.
  await settleServiceFee(booking).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('settleServiceFee failed:', err);
  });
  await recordSocietyDeductionsForBooking(booking).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('recordSocietyDeductionsForBooking failed:', err);
  });
  await recordPlatformCommissionForBooking(booking).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('recordPlatformCommissionForBooking failed:', err);
  });
  // P1.3: a guarantee re-work pays its labour from the reserve.
  await settleRework(booking).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('settleRework failed:', err);
  });

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role as never,
    action: `booking_completed_${via}`,
    targetType: 'Booking',
    targetId: booking._id.toString(),
    details: { via },
  });
  emitBookingStatus(booking);
  return booking;
}

/**
 * After a dispute on a waiting job is resolved, lift the hold so the job
 * can be confirmed (by the customer or the auto-confirm window). Leaves it
 * held while any other dispute on the same booking is still open.
 */
export async function releaseSettlementHoldIfClear(bookingId: string): Promise<boolean> {
  if (await hasActiveDispute(bookingId)) return false;
  const r = await Booking.updateOne(
    { _id: bookingId, status: 'awaiting_confirmation', settlementHeld: true },
    { settlementHeld: false }
  );
  return r.modifiedCount > 0;
}

export async function hasActiveDispute(bookingId: string): Promise<boolean> {
  return !!(await Dispute.exists({ bookingId, status: { $in: ACTIVE_DISPUTE } }));
}

/**
 * Confirms every job that has waited AUTO_CONFIRM_HOURS without the
 * customer confirming or reporting a problem. Returns how many it settled.
 */
export async function runAutoConfirm(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - env.AUTO_CONFIRM_HOURS * 3600_000);
  const due = await Booking.find({
    status: 'awaiting_confirmation',
    workDoneAt: { $lte: cutoff },
    settlementHeld: { $ne: true },
  })
    .select('_id')
    .lean();
  let done = 0;
  for (const b of due) {
    if (await hasActiveDispute(b._id.toString())) continue;
    const r = await finalizeCompletion(b._id.toString(), 'auto', { id: SYSTEM_ACTOR_ID, role: 'system' });
    if (r) done += 1;
  }
  return done;
}

let handle: ReturnType<typeof setInterval> | null = null;
const POLL_MS = 15 * 60 * 1000;

/** In-process poll; P3.1 moves it to a BullMQ repeatable job when Redis is set. */
export function startAutoConfirmRunner(): void {
  if (handle) return;
  handle = setInterval(() => {
    runAutoConfirm().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('auto-confirm run failed:', err);
    });
  }, POLL_MS);
  handle.unref?.();
}
