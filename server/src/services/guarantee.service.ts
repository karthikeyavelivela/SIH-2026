import { Types, type HydratedDocument } from 'mongoose';
import { Booking, IBooking } from '../models/Booking';
import { ServiceCategory } from '../models/ServiceCategory';
import { Complaint } from '../models/Complaint';
import { FareRule } from '../models/FareRule';
import { LedgerEntry } from '../models/LedgerEntry';
import { Mutha } from '../models/Mutha';
import { Payout } from '../models/Payout';
import { TrainingModule } from '../models/TrainingModule';
import { TrainingProgress } from '../models/TrainingProgress';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { writeAuditLog, SYSTEM_ACTOR_ID } from './audit.service';
import { writeLedgerEntry } from './ledger.service';
import { createNotification } from './notification.service';

/**
 * The workmanship guarantee — now claimable.
 *
 * `ServiceCategory.guaranteeEligible` and `guaranteePeriodDays` have existed
 * for a long time, and the customer dashboard has been showing a
 * "Workmanship guarantee" badge off the first of them. Nothing consumed
 * either field: there was no claim, no window check, no route. The app was
 * promising something a customer could not collect, which is the one kind of
 * gap worse than a missing feature.
 *
 * The choice here was to build it rather than hide the badge, because the
 * pieces were all present — a per-category window, a completion timestamp,
 * and an existing grievance pipeline with an admin queue behind it. A claim
 * is a Complaint of category `workmanship`: it lands in the same queue, with
 * the same audit trail and the same resolution flow the desk already uses.
 * Inventing a parallel claims system would have been a second half-built
 * thing beside the first.
 *
 * P1.3 closes the loop: a claim also books the re-work, straight to the
 * worker who did the job (a society leader can reassign it). The customer
 * pays only materials; the worker's labour is paid at the base rate from the
 * guarantee reserve that 1% of every service fee builds. Two or more claims
 * in 90 days assign the worker their trade's training and tell their leader
 * — support, never a penalty.
 */

export interface GuaranteeStatus {
  eligible: boolean;
  /** P1.3 — the re-work booking a claim created, when one exists. */
  reworkBookingId?: string;
  /** Absent when the category carries no guarantee. */
  periodDays?: number;
  expiresAt?: Date;
  daysLeft?: number;
  /** Set when a claim has already been raised for this booking. */
  claimedComplaintId?: string;
  /** Why not, when not — so the UI can say something true instead of hiding. */
  reason?: 'not_completed' | 'category_not_eligible' | 'window_expired' | 'already_claimed';
}

/** The moment the job was actually finished, from its own status history. */
export function completedAt(booking: IBooking): Date | undefined {
  const entry = [...(booking.statusHistory ?? [])].reverse().find((h) => h.status === 'completed');
  return entry?.timestamp;
}

export async function guaranteeStatusFor(booking: IBooking): Promise<GuaranteeStatus> {
  if (booking.status !== 'completed') return { eligible: false, reason: 'not_completed' };

  const category = booking.serviceCategorySlug
    ? await ServiceCategory.findOne({ slug: booking.serviceCategorySlug }).lean()
    : null;

  if (!category?.guaranteeEligible) return { eligible: false, reason: 'category_not_eligible' };

  const finished = completedAt(booking) ?? booking.createdAt;
  const periodDays = category.guaranteePeriodDays ?? 7;
  const expiresAt = new Date(finished.getTime() + periodDays * 24 * 60 * 60 * 1000);

  const existing = await Complaint.findOne({ bookingId: booking._id, category: 'workmanship' })
    .select('_id reworkBookingId')
    .lean();
  if (existing) {
    return {
      eligible: false,
      periodDays,
      expiresAt,
      claimedComplaintId: String(existing._id),
      reworkBookingId: existing.reworkBookingId ? String(existing.reworkBookingId) : undefined,
      reason: 'already_claimed',
    };
  }

  const msLeft = expiresAt.getTime() - Date.now();
  if (msLeft <= 0) return { eligible: false, periodDays, expiresAt, reason: 'window_expired' };

  return {
    eligible: true,
    periodDays,
    expiresAt,
    daysLeft: Math.ceil(msLeft / (24 * 60 * 60 * 1000)),
  };
}

/**
 * Raise a claim. Re-checks eligibility server-side rather than trusting that
 * the client only showed the button when it should have — the window is a
 * contractual boundary, not a UI state.
 */
export async function claimGuarantee(userId: string, bookingId: string, description: string) {
  const booking = await Booking.findOne({ _id: bookingId, customerId: userId });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const status = await guaranteeStatusFor(booking);
  if (!status.eligible) {
    const message =
      status.reason === 'already_claimed'
        ? 'A guarantee claim has already been raised for this job'
        : status.reason === 'window_expired'
          ? 'The guarantee period for this job has ended'
          : status.reason === 'not_completed'
            ? 'A guarantee claim can only be raised once the job is complete'
            : 'This service does not carry a workmanship guarantee';
    throw new ApiError(400, message, { reason: status.reason });
  }

  const complaint = await Complaint.create({
    bookingId: booking._id,
    raisedByUserId: userId,
    againstUserId: booking.assignedHamaliIds?.[0] ?? booking.assignedDriverIds?.[0],
    againstMuthaId: booking.assignedMuthaId,
    category: 'workmanship',
    description,
  });

  const rework = await createReworkBooking(booking, complaint._id);
  complaint.reworkBookingId = rework._id;
  await complaint.save();

  const workerIds = [...(booking.assignedHamaliIds ?? []), ...(booking.assignedDriverIds ?? [])].map(String);
  for (const id of workerIds) await supportIfRepeated(id, booking);
  return complaint;
}

// ------------------------------------------------------------- P1.3 re-work

const REPEAT_WINDOW_DAYS = 90;
const REPEAT_THRESHOLD = 2;

/**
 * The labour rate a re-work pays, per worker: the region's standard base
 * rate for this kind of job — the fare rule ordinary dispatch is priced
 * with — never the original job's own price, which for a quoted renovation
 * could be many times the work being redone. Zero when the region has no
 * rule; the payment then waits for an admin rather than using a guess.
 */
export async function reworkBaseRate(booking: Pick<IBooking, 'region' | 'type'>): Promise<number> {
  if (!booking.region) return 0;
  const category = booking.type === 'truck' ? 'vehicle_small' : 'hamali';
  const rule = await FareRule.findOne({ region: booking.region, category, active: true })
    .sort({ effectiveFrom: -1 })
    .lean();
  return rule ? rule.baseFare : 0;
}

/** Books the re-work straight to the original worker(s): no dispatch, no fee, labour free to the customer. */
async function createReworkBooking(original: HydratedDocument<IBooking>, complaintId: Types.ObjectId) {
  const now = new Date();
  const ref = original._id.toString().slice(-6).toUpperCase();
  const rework = await Booking.create({
    customerId: original.customerId,
    type: original.type,
    region: original.region,
    serviceCategorySlug: original.serviceCategorySlug,
    cargoDetails: { weightKg: 0, description: `Guarantee re-work of ${ref}` },
    pickupLocation: {
      type: 'Point',
      coordinates: original.pickupLocation.coordinates,
      address: original.pickupLocation.address,
    },
    dropLocation: {
      type: 'Point',
      coordinates: original.dropLocation.coordinates,
      address: original.dropLocation.address,
    },
    requiredHamaliCount: original.requiredHamaliCount,
    requiredVehicles: original.requiredVehicles,
    assignedHamaliIds: original.assignedHamaliIds,
    assignedDriverIds: original.assignedDriverIds,
    assignedMuthaId: original.assignedMuthaId,
    preferredWorkerId: original.preferredWorkerId,
    status: 'accepted',
    // Nothing for labour and no service fee; materials, if the worker records
    // any, are added before completion.
    fareBreakdown: {
      baseFare: 0,
      distanceFare: 0,
      surgeMultiplier: 1,
      hamaliFare: 0,
      total: 0,
      workerRate: 0,
      serviceFeePct: 0,
      serviceFee: 0,
    },
    statusHistory: [{ status: 'accepted', timestamp: now }],
    isRework: true,
    reworkOfBookingId: original._id,
    guaranteeComplaintId: complaintId,
    isVerification: original.isVerification,
  });

  const labour = await reworkBaseRate(original);
  for (const id of [...(original.assignedHamaliIds ?? []), ...(original.assignedDriverIds ?? [])]) {
    await createNotification(id.toString(), 'guarantee_rework', { ref, labour });
  }
  if (original.assignedMuthaId) {
    const mutha = await Mutha.findById(original.assignedMuthaId).select('leaderId').lean();
    if (mutha) await createNotification(mutha.leaderId.toString(), 'guarantee_rework', { ref, labour });
  }
  await writeAuditLog({
    actorId: String(original.customerId),
    actorRole: 'customer',
    action: 'guarantee_rework_booked',
    targetType: 'Booking',
    targetId: rework._id.toString(),
    details: { originalBookingId: original._id.toString(), complaintId: complaintId.toString(), labourPerWorker: labour },
  });
  return rework;
}

const TRADE_AREA_BY_SKILL: Record<string, string> = {
  electrical: 'electrical',
  plumbing: 'plumbing',
  carpentry: 'carpentry',
  cleaning: 'domestic_help',
  cooking: 'domestic_help',
  caregiving: 'domestic_help',
};

/**
 * Two or more guarantee claims in 90 days: the worker is assigned the
 * training for their trade and their society leader is told. Never a
 * penalty — no rating change, no suspension, nothing withheld.
 */
async function supportIfRepeated(workerId: string, booking: IBooking): Promise<void> {
  const since = new Date(Date.now() - REPEAT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const count = await Complaint.countDocuments({ againstUserId: workerId, category: 'workmanship', createdAt: { $gte: since } });
  if (count < REPEAT_THRESHOLD) return;

  const category = booking.serviceCategorySlug
    ? await ServiceCategory.findOne({ slug: booking.serviceCategorySlug }).select('requiredSkills').lean()
    : null;
  const area = (category?.requiredSkills ?? []).map((sk) => TRADE_AREA_BY_SKILL[sk]).find(Boolean);
  const trainingModule =
    (area ? await TrainingModule.findOne({ tradeArea: area }).sort({ order: 1 }).lean() : null) ??
    (await TrainingModule.findOne({}).sort({ order: 1 }).lean());
  if (!trainingModule) return;

  const already = await TrainingProgress.findOne({
    userId: workerId,
    moduleId: trainingModule._id,
    status: { $ne: 'completed' },
  }).lean();
  if (!already) {
    await TrainingProgress.create({
      userId: workerId,
      moduleId: trainingModule._id,
      status: 'in_progress',
      assignedReason: 'guarantee_claims',
    });
  }
  await createNotification(workerId, 'training_assigned', { module: trainingModule.title, count });

  const mutha = await Mutha.findOne({ $or: [{ memberIds: workerId }, { leaderId: workerId }] }).select('leaderId').lean();
  const worker = await User.findById(workerId).select('name').lean();
  if (mutha && mutha.leaderId.toString() !== workerId) {
    await createNotification(mutha.leaderId.toString(), 'system_alert', {
      kind: 'repeat_guarantee_claims',
      member: worker?.name ?? 'A member',
      count,
      module: trainingModule.title,
    });
  }
  await writeAuditLog({
    actorId: SYSTEM_ACTOR_ID,
    actorRole: 'system' as never,
    action: 'guarantee_repeat_support',
    targetType: 'User',
    targetId: workerId,
    details: { claimsIn90Days: count, moduleId: trainingModule._id.toString(), alreadyAssigned: !!already },
  });
}

/** The reserve: the guarantee part of every service fee, less what re-work has drawn. */
export async function guaranteeReserveBalance(): Promise<number> {
  const rows = await LedgerEntry.aggregate([
    { $match: { type: { $in: ['guarantee_reserve', 'guarantee_reserve_payout'] } } },
    { $group: { _id: '$type', total: { $sum: '$amount' } } },
  ]);
  const inflow = rows.find((r) => r._id === 'guarantee_reserve')?.total ?? 0;
  const outflow = rows.find((r) => r._id === 'guarantee_reserve_payout')?.total ?? 0;
  return Math.round((inflow - outflow) * 100) / 100;
}

/**
 * On completion of a re-work: pay each worker's labour at the base rate from
 * the reserve. Idempotent (reworkLabourPayoutId). If the reserve cannot
 * cover it, or the region has no base rate, the payment is created pending
 * for an admin rather than overdrawing the reserve or inventing a rate.
 */
export async function settleRework(booking: HydratedDocument<IBooking>): Promise<void> {
  if (!booking.isRework || booking.status !== 'completed' || booking.reworkLabourPayoutId) return;
  const workers = [...(booking.assignedHamaliIds ?? []), ...(booking.assignedDriverIds ?? [])].map(String);
  if (workers.length === 0) return;
  const rate = await reworkBaseRate(booking);
  const ref = booking._id.toString().slice(-6).toUpperCase();

  let firstPayoutId: Types.ObjectId | undefined;
  for (const workerId of workers) {
    const balance = await guaranteeReserveBalance();
    const canPay = rate > 0 && balance >= rate;
    const payout = await new Payout({
      userId: workerId,
      amount: rate,
      period: new Date().toISOString().slice(0, 10),
      status: canPay ? 'paid' : 'pending',
      decidedAt: canPay ? new Date() : undefined,
      source: 'guarantee_rework',
      sourceRefId: booking._id,
      breakdown: { baseRate: rate, reserveBefore: balance },
    }).save();
    if (canPay) {
      await writeLedgerEntry({
        type: 'guarantee_reserve_payout',
        entityType: 'Platform',
        entityId: SYSTEM_ACTOR_ID,
        amount: rate,
        description: `Guarantee re-work labour for booking ${ref}, paid at the base rate`,
        region: booking.region,
      });
    }
    firstPayoutId = firstPayoutId ?? payout._id;
    await writeAuditLog({
      actorId: SYSTEM_ACTOR_ID,
      actorRole: 'system' as never,
      action: canPay ? 'guarantee_rework_labour_paid' : 'guarantee_rework_labour_pending',
      targetType: 'Payout',
      targetId: payout._id.toString(),
      details: {
        bookingId: booking._id.toString(),
        rate,
        reserveBefore: balance,
        reason: canPay ? undefined : rate <= 0 ? 'no base rate for this region' : 'reserve too low',
      },
    });
  }
  booking.reworkLabourPayoutId = firstPayoutId;
  await booking.save();
}

/** The worker records materials used on a re-work, before completing it. That, and only that, is what the customer pays. */
export async function recordReworkMaterials(workerId: string, bookingId: string, amount: number, note?: string) {
  const booking = await Booking.findOne({
    _id: bookingId,
    isRework: true,
    $or: [{ assignedHamaliIds: workerId }, { assignedDriverIds: workerId }],
  });
  if (!booking) throw new ApiError(404, 'Re-work job not found');
  if (!['accepted', 'in_progress'].includes(booking.status)) {
    throw new ApiError(400, 'Materials can only be recorded before the job is completed');
  }
  const materials = Math.round(amount * 100) / 100;
  booking.materialsCost = materials;
  booking.materialsNote = note?.trim().slice(0, 300) || undefined;
  // The worker is reimbursed the materials in full; no service fee applies.
  booking.fareBreakdown = {
    baseFare: 0,
    distanceFare: 0,
    surgeMultiplier: 1,
    hamaliFare: 0,
    total: materials,
    workerRate: materials,
    serviceFeePct: 0,
    serviceFee: 0,
  };
  await booking.save();
  return booking;
}

/** A society leader moves a re-work to other members (e.g. the original worker is unavailable). */
export async function reassignRework(leaderId: string, bookingId: string, memberIds: string[]) {
  const booking = await Booking.findOne({ _id: bookingId, isRework: true });
  if (!booking || !booking.assignedMuthaId) throw new ApiError(404, 'Re-work job not found');
  const mutha = await Mutha.findOne({ _id: booking.assignedMuthaId, leaderId }).select('memberIds').lean();
  if (!mutha) throw new ApiError(404, 'Re-work job not found');
  if (booking.status !== 'accepted') throw new ApiError(400, 'Only a re-work that has not started can be reassigned');
  const members = new Set(mutha.memberIds.map(String));
  if (memberIds.length === 0 || !memberIds.every((m) => members.has(m))) {
    throw new ApiError(400, 'Every assignee must be a member of your society');
  }
  booking.assignedHamaliIds = memberIds.map((m) => new Types.ObjectId(m));
  booking.requiredHamaliCount = memberIds.length;
  await booking.save();
  await writeAuditLog({
    actorId: leaderId,
    actorRole: 'mutha_leader',
    action: 'guarantee_rework_reassigned',
    targetType: 'Booking',
    targetId: booking._id.toString(),
    details: { memberIds },
  });
  const labour = await reworkBaseRate(booking);
  const ref = booking._id.toString().slice(-6).toUpperCase();
  for (const m of memberIds) await createNotification(m, 'guarantee_rework', { ref, labour });
  return booking;
}
