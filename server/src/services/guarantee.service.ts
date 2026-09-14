import { Booking, IBooking } from '../models/Booking';
import { ServiceCategory } from '../models/ServiceCategory';
import { Complaint } from '../models/Complaint';
import { ApiError } from '../utils/ApiError';

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
 */

export interface GuaranteeStatus {
  eligible: boolean;
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

  const existing = await Complaint.findOne({ bookingId: booking._id, category: 'workmanship' }).select('_id').lean();
  if (existing) {
    return {
      eligible: false,
      periodDays,
      expiresAt,
      claimedComplaintId: String(existing._id),
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

  return Complaint.create({
    bookingId: booking._id,
    raisedByUserId: userId,
    againstUserId: booking.assignedHamaliIds?.[0] ?? booking.assignedDriverIds?.[0],
    againstMuthaId: booking.assignedMuthaId,
    category: 'workmanship',
    description,
  });
}
