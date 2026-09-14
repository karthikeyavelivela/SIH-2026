import { Types } from 'mongoose';
import { ApiError } from '../utils/ApiError';
import {
  Quotation,
  IQuotation,
  IQuotationLineItem,
  MILESTONE_THRESHOLD_RUPEES,
  DEFAULT_VALIDITY_DAYS,
} from '../models/Quotation';
import { VariationOrder } from '../models/VariationOrder';
import { Booking } from '../models/Booking';
import { WorkerPricingProfile } from '../models/WorkerPricingProfile';
import { createNotification } from './notification.service';

/**
 * The quotation lifecycle.
 *
 * Instant booking cannot price work nobody has looked at yet. A rewire, a
 * bespoke wardrobe, a bathroom rebuild — these are quoted after a visit, and
 * that is a different shape of transaction with its own states:
 *
 *   requested -> visit_scheduled -> visit_done -> submitted
 *                                         -> negotiating -> submitted
 *                                         -> accepted | rejected | expired
 *
 * Two invariants are enforced here rather than asked for politely:
 *
 *   1. ACCEPTANCE FREEZES THE PRICE. `frozenTotal` is written once and is
 *      what the booking charges. No function in this file recomputes it, and
 *      every mutation of line items refuses to run on an accepted quotation.
 *
 *   2. NOTHING MOVES THE AMOUNT AFTERWARDS EXCEPT AN APPROVED VARIATION.
 *      A variation order starts as a request and changes the payable total
 *      only once the customer has approved it — see approveVariation.
 *
 * Both are structural: there is no code path from a worker's action to a
 * higher bill without the customer's explicit approval in between.
 */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Totals are computed here, never accepted from the client. */
export function totalsFor(lineItems: IQuotationLineItem[]) {
  const labourSubtotal = round2(
    lineItems.filter((l) => !l.isMaterial).reduce((sum, l) => sum + l.quantity * l.rate, 0)
  );
  const materialSubtotal = round2(
    lineItems.filter((l) => l.isMaterial).reduce((sum, l) => sum + l.quantity * l.rate, 0)
  );
  return { labourSubtotal, materialSubtotal, total: round2(labourSubtotal + materialSubtotal) };
}

export function normaliseLineItems(raw: unknown[]): IQuotationLineItem[] {
  return (raw ?? []).map((item) => {
    const l = item as Partial<IQuotationLineItem>;
    const quantity = Number(l.quantity ?? 0);
    const rate = Number(l.rate ?? 0);
    return {
      description: String(l.description ?? '').slice(0, 200),
      unitType: l.unitType,
      quantity,
      rate,
      // Recomputed, never trusted: a client-supplied amount is the one number
      // in a quotation that must not be able to disagree with its own maths.
      amount: round2(quantity * rate),
      isMaterial: !!l.isMaterial,
      materialIsEstimate: !!l.materialIsEstimate,
    };
  });
}

async function load(quotationId: string): Promise<IQuotation & { save: () => Promise<unknown> }> {
  const quotation = await Quotation.findById(quotationId);
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  return quotation as unknown as IQuotation & { save: () => Promise<unknown> };
}

function assertWorker(quotation: IQuotation, userId: string) {
  if (quotation.workerId.toString() !== userId) throw new ApiError(403, 'This quotation is not yours');
}

function assertCustomer(quotation: IQuotation, userId: string) {
  if (quotation.customerId.toString() !== userId) throw new ApiError(403, 'This quotation is not yours');
}

/** Nothing about an accepted quotation's money may be edited. Ever. */
function assertNotAccepted(quotation: IQuotation) {
  if (quotation.status === 'accepted') {
    throw new ApiError(
      409,
      'This quotation was accepted and its price is fixed. Raise a variation for any extra work.',
      { reason: 'quotation_frozen' }
    );
  }
}

// ------------------------------------------------------------- the states

export async function requestQuotation(input: {
  customerId: string;
  workerId: string;
  categorySlug: string;
  jobDescription: string;
  photos?: string[];
}) {
  const profile = await WorkerPricingProfile.findOne({
    workerId: input.workerId,
    categorySlug: input.categorySlug,
    active: true,
  }).lean();
  if (!profile?.quotation?.accepts) {
    throw new ApiError(422, 'This worker does not take quotation work for that service');
  }

  const quotation = await Quotation.create({
    customerId: input.customerId,
    workerId: input.workerId,
    categorySlug: input.categorySlug,
    jobDescription: input.jobDescription,
    photos: (input.photos ?? []).slice(0, 6),
    status: 'requested',
    // Copied from the profile at request time, so a later change to the
    // worker's published fee cannot alter what this customer was told.
    siteVisit: {
      fee: profile.quotation.siteVisitFee ?? 0,
      feeAdjustable: profile.quotation.siteVisitAdjustable ?? true,
    },
  });

  await createNotification(
    input.workerId,
    'quotation_update',
    { event: 'requested' },
    `/worker/quotations/${quotation._id}`
  );
  return quotation;
}

export async function scheduleVisit(userId: string, quotationId: string, scheduledAt: Date) {
  const quotation = await load(quotationId);
  assertWorker(quotation, userId);
  if (quotation.status !== 'requested') throw new ApiError(409, 'This visit has already been arranged');

  quotation.status = 'visit_scheduled';
  quotation.siteVisit = { ...(quotation.siteVisit ?? { fee: 0, feeAdjustable: true }), scheduledAt };
  await quotation.save();

  await createNotification(
    quotation.customerId.toString(),
    'quotation_update',
    { event: 'visit_scheduled' },
    `/customer/quotations/${quotation._id}`
  );
  return quotation;
}

export async function completeVisit(userId: string, quotationId: string) {
  const quotation = await load(quotationId);
  assertWorker(quotation, userId);
  if (quotation.status !== 'visit_scheduled') throw new ApiError(409, 'No visit is scheduled for this job');

  quotation.status = 'visit_done';
  quotation.siteVisit = {
    ...(quotation.siteVisit ?? { fee: 0, feeAdjustable: true }),
    completedAt: new Date(),
  };
  await quotation.save();
  return quotation;
}

/**
 * Submit, or re-submit after a change request.
 *
 * A re-submission keeps the version it replaces. When a customer and a worker
 * later disagree about what was quoted, the answer should be in the record
 * rather than in either person's memory.
 */
export async function submitQuotation(
  userId: string,
  quotationId: string,
  input: { lineItems: unknown[]; validityDays?: number; note?: string }
) {
  const quotation = await load(quotationId);
  assertWorker(quotation, userId);
  assertNotAccepted(quotation);
  if (!['visit_done', 'negotiating', 'submitted'].includes(quotation.status)) {
    throw new ApiError(409, 'Complete the site visit before sending a quotation');
  }

  if (quotation.lineItems.length > 0) {
    quotation.revisions.push({
      lineItems: quotation.lineItems,
      labourSubtotal: quotation.labourSubtotal,
      materialSubtotal: quotation.materialSubtotal,
      total: quotation.total,
      submittedAt: quotation.updatedAt ?? new Date(),
      supersededBy: 'worker',
      note: input.note,
    });
  }

  const lineItems = normaliseLineItems(input.lineItems);
  if (lineItems.length === 0) throw new ApiError(400, 'A quotation needs at least one line');

  const { labourSubtotal, materialSubtotal, total } = totalsFor(lineItems);
  const validityDays = input.validityDays && input.validityDays > 0 ? input.validityDays : DEFAULT_VALIDITY_DAYS;

  quotation.lineItems = lineItems;
  quotation.labourSubtotal = labourSubtotal;
  quotation.materialSubtotal = materialSubtotal;
  quotation.total = total;
  quotation.validUntil = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000);
  quotation.status = 'submitted';
  await quotation.save();

  await createNotification(
    quotation.customerId.toString(),
    'quotation_update',
    { event: 'submitted' },
    `/customer/quotations/${quotation._id}`
  );
  return quotation;
}

/** The customer's one round of negotiation. Both versions are retained. */
export async function requestChanges(userId: string, quotationId: string, note: string) {
  const quotation = await load(quotationId);
  assertCustomer(quotation, userId);
  assertNotAccepted(quotation);
  if (quotation.status !== 'submitted') throw new ApiError(409, 'There is no quotation to respond to yet');
  if (quotation.revisions.length >= 1) {
    throw new ApiError(409, 'One round of changes has already been requested on this quotation');
  }

  quotation.status = 'negotiating';
  quotation.revisions.push({
    lineItems: quotation.lineItems,
    labourSubtotal: quotation.labourSubtotal,
    materialSubtotal: quotation.materialSubtotal,
    total: quotation.total,
    submittedAt: new Date(),
    supersededBy: 'customer',
    note: note.slice(0, 500),
  });
  await quotation.save();

  await createNotification(
    quotation.workerId.toString(),
    'quotation_update',
    { event: 'changes_requested' },
    `/worker/quotations/${quotation._id}`
  );
  return quotation;
}

export function isExpired(quotation: Pick<IQuotation, 'validUntil'>): boolean {
  return !!quotation.validUntil && quotation.validUntil.getTime() < Date.now();
}

/**
 * Acceptance. The one moment a quotation's number becomes binding.
 *
 * Writes `frozenTotal`, builds the milestone schedule for larger jobs, and
 * creates the booking the work will actually happen under. After this
 * returns, nothing in this service will change the total.
 */
export async function acceptQuotation(
  userId: string,
  quotationId: string,
  where: { coordinates: [number, number]; address: string; region?: string }
) {
  const quotation = await load(quotationId);
  assertCustomer(quotation, userId);
  if (quotation.status === 'accepted') throw new ApiError(409, 'You have already accepted this quotation');
  if (quotation.status !== 'submitted') throw new ApiError(409, 'There is no quotation to accept');
  if (isExpired(quotation)) {
    quotation.status = 'expired';
    await quotation.save();
    throw new ApiError(409, 'This quotation has expired — ask for a fresh one', { reason: 'quotation_expired' });
  }

  quotation.frozenTotal = quotation.total;
  quotation.status = 'accepted';
  quotation.acceptedAt = new Date();

  // Milestones only above the threshold. Splitting a ₹4,000 job into three
  // payments would be ceremony, not protection.
  if (quotation.total >= MILESTONE_THRESHOLD_RUPEES) {
    quotation.milestones = [
      { label: 'advance', percentage: 30, amount: round2(quotation.total * 0.3), status: 'pending' },
      { label: 'progress', percentage: 40, amount: round2(quotation.total * 0.4), status: 'pending' },
      { label: 'final', percentage: 30, amount: round2(quotation.total * 0.3), status: 'pending' },
    ];
  }

  const booking = await Booking.create({
    customerId: quotation.customerId,
    type: 'hamali',
    serviceCategorySlug: quotation.categorySlug,
    pricingMode: 'quotation',
    quotationId: quotation._id,
    preferredWorkerId: quotation.workerId,
    region: where.region,
    cargoDetails: { weightKg: 0 },
    pickupLocation: { type: 'Point', coordinates: where.coordinates, address: where.address },
    dropLocation: { type: 'Point', coordinates: where.coordinates, address: where.address },
    requiredHamaliCount: 1,
    status: 'searching',
    fareBreakdown: {
      baseFare: 0,
      distanceFare: 0,
      surgeMultiplier: 1,
      hamaliFare: quotation.frozenTotal,
      total: quotation.frozenTotal,
    },
    statusHistory: [{ status: 'searching', timestamp: new Date() }],
  });

  quotation.bookingId = booking._id;
  await quotation.save();

  await createNotification(
    quotation.workerId.toString(),
    'quotation_update',
    { event: 'accepted' },
    `/worker/quotations/${quotation._id}`
  );
  return { quotation, booking };
}

export async function rejectQuotation(userId: string, quotationId: string, reason?: string) {
  const quotation = await load(quotationId);
  assertCustomer(quotation, userId);
  assertNotAccepted(quotation);

  quotation.status = 'rejected';
  quotation.rejectedAt = new Date();
  quotation.rejectionReason = reason?.slice(0, 500);
  await quotation.save();

  await createNotification(
    quotation.workerId.toString(),
    'quotation_update',
    { event: 'rejected' },
    `/worker/quotations/${quotation._id}`
  );
  return quotation;
}

export async function confirmMilestone(userId: string, quotationId: string, index: number) {
  const quotation = await load(quotationId);
  assertCustomer(quotation, userId);
  const milestone = quotation.milestones[index];
  if (!milestone) throw new ApiError(404, 'No such milestone');
  if (milestone.status !== 'pending') throw new ApiError(409, 'That milestone is already confirmed');

  milestone.status = 'confirmed';
  milestone.confirmedAt = new Date();
  await quotation.save();
  return quotation;
}

// ---------------------------------------------------------- variations

export async function requestVariation(
  userId: string,
  quotationId: string,
  input: { description: string; amount: number }
) {
  const quotation = await load(quotationId);
  assertWorker(quotation, userId);
  if (quotation.status !== 'accepted') {
    throw new ApiError(409, 'A variation only applies to work that was already agreed');
  }

  const variation = await VariationOrder.create({
    quotationId: quotation._id,
    bookingId: quotation.bookingId,
    requestedByWorkerId: quotation.workerId,
    customerId: quotation.customerId,
    description: input.description,
    amount: input.amount,
    status: 'requested',
  });

  await createNotification(
    quotation.customerId.toString(),
    'quotation_update',
    { event: 'variation_requested' },
    `/customer/quotations/${quotation._id}`
  );
  return variation;
}

/**
 * The only thing that can move an agreed price — and it is the customer who
 * moves it. The worker asks; this runs when the customer says yes.
 */
export async function approveVariation(userId: string, variationId: string, approve: boolean, note?: string) {
  const variation = await VariationOrder.findById(variationId);
  if (!variation) throw new ApiError(404, 'Variation not found');
  if (variation.customerId.toString() !== userId) throw new ApiError(403, 'This variation is not yours');
  if (variation.status !== 'requested') throw new ApiError(409, 'This variation has already been decided');

  variation.status = approve ? 'approved' : 'rejected';
  variation.customerNote = note?.slice(0, 500);
  if (approve) variation.customerApprovedAt = new Date();
  else variation.rejectedAt = new Date();
  await variation.save();

  if (approve && variation.bookingId) {
    // The booking's charge moves by exactly the approved amount, and only
    // now. The quotation's own frozenTotal is left alone: it records what was
    // agreed at acceptance, and the variations are the documented additions
    // to it.
    const booking = await Booking.findById(variation.bookingId);
    if (booking) {
      const updated = round2(booking.fareBreakdown.total + variation.amount);
      booking.fareBreakdown = {
        ...booking.fareBreakdown,
        hamaliFare: updated,
        total: updated,
      };
      await booking.save();
    }
  }

  return variation;
}

/** Everything owed on an accepted quotation: the frozen total plus approved variations. */
export async function payableFor(quotationId: string) {
  const quotation = await Quotation.findById(quotationId).lean();
  if (!quotation) throw new ApiError(404, 'Quotation not found');
  const variations = await VariationOrder.find({
    quotationId: new Types.ObjectId(quotationId),
    status: 'approved',
  }).lean();

  const variationTotal = round2(variations.reduce((sum, v) => sum + v.amount, 0));
  return {
    frozenTotal: quotation.frozenTotal ?? 0,
    variationTotal,
    payable: round2((quotation.frozenTotal ?? 0) + variationTotal),
    variations,
  };
}
