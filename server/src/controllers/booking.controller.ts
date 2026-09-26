import { Request, Response } from 'express';
import { env } from '../config/env';
import { emitBookingStatus } from '../realtime/emitters';
import { revealCompletionCode, finalizeCompletion, hasActiveDispute } from '../services/completion.service';
import { Dispute } from '../models/Dispute';
import { writeAuditLog } from '../services/audit.service';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { FareRule, IFareRule } from '../models/FareRule';
import { ServiceCategory } from '../models/ServiceCategory';
import { Payment } from '../models/Payment';
import { User } from '../models/User';
import { generateTaxInvoicePdf } from '../services/taxInvoice.service';
import { haversineKm } from '../services/distance.service';
import { bucketVehicleCategoryFromCapacity, computeFareBreakdown } from '../services/fare.service';
import { getSurgeMultiplier } from '../services/surge.service';
import { startVehicleOffers, startHamaliOffers } from '../realtime/offerEngine';
import { findUnratedCompletedBooking } from '../services/ratingGate.service';
import { detectAbnormalCancellationRate } from '../services/fraudDetection.service';
import { guaranteeStatusFor, claimGuarantee } from '../services/guarantee.service';
import { WorkerPricingProfile } from '../models/WorkerPricingProfile';
import { priceWork, UNIT_DECLARATIONS } from '../services/workPricing.service';
import { getFeeSplit, withServiceFee } from '../services/serviceFee.service';

/**
 * The 422 a customer sees when nothing prices their job.
 *
 * `region` is allowed to be '' on purpose (see booking.routes.ts), but the
 * message that produced was "No active fare rule for /vehicle_large" — an
 * empty slug in front of a slash, which tells the customer nothing and made
 * a missing region look like a missing tariff. It is not: all 43 seeded
 * regions carry all four categories. So the blank case gets its own
 * sentence, naming the thing the customer can actually act on.
 */
function noFareRuleError(region: string, category: string): ApiError {
  if (!region.trim()) {
    return new ApiError(
      422,
      'We could not work out which district this job is in, so there is no rate to price it against. Set the district or city on the form and the fare will appear.'
    );
  }
  return new ApiError(422, `No active fare rule for ${region}/${category}`);
}

async function findActiveRule(region: string, category: string) {
  // Task 4's partial unique index on {region,category,active:true} means at
  // most one document can ever match this filter — the .sort() below is
  // defensive only, not load-bearing for correctness.
  return FareRule.findOne({ region, category, active: true }).sort({ effectiveFrom: -1 });
}

interface QuoteInput {
  type: 'truck' | 'hamali' | 'combo';
  region: string;
  pickupLocation: { coordinates: [number, number] };
  dropLocation: { coordinates: [number, number] };
  // Phase 6.3 — ordered intermediate waypoints. Optional/absent = unchanged
  // existing single-leg behaviour.
  stops?: { coordinates: [number, number] }[];
  requiredVehicles?: { capacityKg: number; count: number }[];
  requiredHamaliCount?: number;
}

// Shared by both the quote (preview, no write) and create (persists) paths
// so the two can never compute a different fare for the same inputs — the
// client-facing "estimate" the customer confirms against is the exact same
// code path that produces the fareBreakdown actually saved on the Booking.
async function priceBooking(input: QuoteInput) {
  const { type, region, pickupLocation, dropLocation, stops, requiredVehicles, requiredHamaliCount } = input;

  // Phase 6.3 — multi-stop routing. Sums every consecutive leg
  // (pickup -> stops[0] -> ... -> stops[n-1] -> drop) instead of a single
  // pickup->drop haversine — still the same straight-line-per-leg
  // approximation distance.service.ts's own doc comment already commits
  // to ("No routing-engine integration is in scope"), just summed over
  // more than one leg now.
  const legPoints = [
    pickupLocation.coordinates,
    ...(stops ?? []).map((s) => s.coordinates),
    dropLocation.coordinates,
  ];
  let distanceKm = 0;
  for (let i = 0; i < legPoints.length - 1; i++) {
    distanceKm += haversineKm(
      { lat: legPoints[i][1], lng: legPoints[i][0] },
      { lat: legPoints[i + 1][1], lng: legPoints[i + 1][0] }
    );
  }

  let vehicleRule: IFareRule | null = null;
  if (type === 'truck' || type === 'combo') {
    const vehicleSpec = requiredVehicles?.[0];
    if (!vehicleSpec) throw new ApiError(400, 'requiredVehicles is required for truck/combo bookings');
    // Validates capacityKg directly (throws ApiError(400) on null/NaN/<=0)
    // rather than round-tripping through a manufactured vehicleType string
    // — a malformed capacityKg used to silently fall through to a
    // plausible-but-wrong tier instead of being rejected.
    const category = bucketVehicleCategoryFromCapacity(vehicleSpec.capacityKg);
    const rule = await findActiveRule(region, category);
    if (!rule) throw noFareRuleError(region, category);
    vehicleRule = rule;
  }

  let hamaliRule: IFareRule | null = null;
  if (type === 'hamali' || type === 'combo') {
    // A hamali/combo booking with no actual workers requested would create
    // a real, matchable, zero-fare booking — reject it the same way a
    // truck/combo booking with no vehicle spec is already rejected above.
    if (!requiredHamaliCount || requiredHamaliCount <= 0) {
      throw new ApiError(400, 'requiredHamaliCount must be greater than 0 for hamali/combo bookings');
    }
    const rule = await findActiveRule(region, 'hamali');
    if (!rule) throw noFareRuleError(region, 'hamali');
    hamaliRule = rule;
  }

  // Phase 5: the live region surge ratio REPLACES each rule's stored
  // surgeMultiplier at pricing time — that stored field (admin-settable,
  // always 1.0 by default) was Phase 2's placeholder until this existed.
  // computeFareBreakdown's "higher of the two present components' surge
  // wins" logic (see its own doc comment) still applies unchanged; both
  // components now just get the same region-live value, so that rule is
  // harmless here rather than meaningful, until vehicle/hamali surge is
  // ever computed independently.
  const liveSurge = await getSurgeMultiplier(region);

  const workerFare = computeFareBreakdown({
    vehicleRule: vehicleRule
      ? {
          baseFare: vehicleRule.baseFare,
          perKmRate: vehicleRule.perKmRate,
          minimumFare: vehicleRule.minimumFare,
          surgeMultiplier: liveSurge,
        }
      : undefined,
    distanceKm,
    hamaliRule: hamaliRule
      ? {
          baseFare: hamaliRule.baseFare,
          perKmRate: hamaliRule.perKmRate,
          minimumFare: hamaliRule.minimumFare,
          surgeMultiplier: liveSurge,
        }
      : undefined,
    hamaliCount: requiredHamaliCount ?? 0,
  });

  // P1.1 — the rule-priced amount is the worker's rate; the customer pays
  // the service fee on top of it.
  const fareBreakdown = withServiceFee(workerFare, await getFeeSplit());
  return { fareBreakdown, distanceKm };
}

// Preview-only: prices a would-be booking without writing anything, so the
// client can show an honest itemized total before the customer commits.
// Takes the exact same shape as createBooking's pricing inputs (and the
// exact same route-level validators) so a quote can never diverge from
// what create would actually charge.
export const quoteBooking = asyncHandler(async (req: Request, res: Response) => {
  const { region, pickupLocation, dropLocation, stops, requiredVehicles, requiredHamaliCount, serviceCategorySlug } = req.body;
  const { pricingMode, unitType, quantity, taskName, quotationId, workerId } = req.body;
  let { type } = req.body;

  // A work-priced estimate never touches the distance engine: the number
  // comes from the named worker's published rate, and it is the same
  // function that will price the booking itself.
  if (pricingMode && workerId) {
    const profile = await WorkerPricingProfile.findOne({
      workerId,
      categorySlug: serviceCategorySlug,
      active: true,
    }).lean();
    if (!profile) throw new ApiError(404, 'That worker has not published rates for this service');
    const fare = await priceWork({ profile, mode: pricingMode, unitType, quantity, taskName, quotationId });
    res.status(200).json({
      fareBreakdown: withServiceFee(
        { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: fare.total, total: fare.total },
        await getFeeSplit()
      ),
      workFare: fare,
    });
    return;
  }

  if (serviceCategorySlug) {
    const category = await ServiceCategory.findOne({ slug: serviceCategorySlug, active: true }).lean();
    if (!category) throw new ApiError(400, `Unknown or inactive service category: ${serviceCategorySlug}`);
    type = category.dispatchType;
  }
  const { fareBreakdown, distanceKm } = await priceBooking({
    type,
    region,
    pickupLocation,
    dropLocation,
    stops,
    requiredVehicles,
    requiredHamaliCount,
  });
  res.status(200).json({ fareBreakdown, distanceKm });
});

export const createBooking = asyncHandler(async (req: Request, res: Response) => {
  // Spec: rating is "mandatory before either can start a new booking/accept
  // a new job, to keep rating coverage high". Checked before any other
  // work so a customer with an unrated completed trip is blocked at the
  // very first step, not partway through pricing/creation.
  const unratedBookingId = await findUnratedCompletedBooking(req.user!.id);
  if (unratedBookingId) {
    throw new ApiError(403, 'Please rate your last completed booking before making a new one', {
      unratedBookingId,
    });
  }

  // Only these fields are ever read from the body — fareBreakdown, status,
  // customerId, or anything else the client sends is silently ignored.
  const {
    region,
    cargoDetails,
    pickupLocation,
    dropLocation,
    stops,
    requiredVehicles,
    requiredHamaliCount,
    scheduledFor,
    openForBidding,
    serviceCategorySlug,
    // Scan and Diagnose. The photo URL is one this server produced and
    // returned from /api/assistant/diagnose-photo — a client-supplied URL
    // pointing anywhere else is just a string in a field nobody renders as
    // a link, so it carries no more trust than the description does.
    diagnosisPhotoUrl,
    diagnosisSummary,
    // Work-based pricing. Present together or not at all: a customer either
    // hires a named worker at that worker's own published rate, or raises an
    // ordinary dispatch priced by the region's fare rules.
    pricingMode,
    unitType,
    quantity,
    taskName,
    quotationId,
    workerId,
    unitDeclaration,
  } = req.body;
  let { type } = req.body;

  // SIH26089 Phase C — when a specific ServiceCategory is chosen (e.g.
  // "electrician"), the server derives the real dispatch mechanism
  // (`type`) from that category's own dispatchType — never trusts a
  // client-supplied `type` alongside a category, so a customer can't
  // claim "electrician" while asking for the fixed-weight cargo dispatch
  // path or vice versa. No category chosen = 100% unchanged pre-Phase-C
  // behaviour (client's own `type` is used as-is).
  if (serviceCategorySlug) {
    const category = await ServiceCategory.findOne({ slug: serviceCategorySlug, active: true }).lean();
    if (!category) throw new ApiError(400, `Unknown or inactive service category: ${serviceCategorySlug}`);
    type = category.dispatchType;
  }

  // Phase 6.2 — load board with bidding. See Booking.openForBidding's doc
  // comment for the full scoping rationale (truck/hamali only, never
  // combo/scheduled — a single winning bidder maps onto the existing
  // single-actor accept functions, a combo/mutha crew winning bid does not).
  if (openForBidding) {
    if (type === 'combo') throw new ApiError(400, 'Bidding is not available for combo bookings yet');
    if (scheduledFor) throw new ApiError(400, 'Bidding is not available for scheduled bookings');
  }

  // Phase 6 — scheduled booking. scheduledFor is optional; when present it
  // must be far enough out that "scheduled" actually means something
  // (not indistinguishable from instant) and not unreasonably far ahead
  // (surge/fare rules this far out are not something priceBooking commits
  // to honouring literally at release time — see the note on the release
  // loop re-using the exact same matching path, not the exact same price).
  const MIN_LEAD_MS = 30 * 60 * 1000;
  const MAX_LEAD_MS = 14 * 24 * 60 * 60 * 1000;
  let scheduledForDate: Date | undefined;
  if (scheduledFor) {
    scheduledForDate = new Date(scheduledFor);
    const leadMs = scheduledForDate.getTime() - Date.now();
    if (Number.isNaN(scheduledForDate.getTime())) throw new ApiError(400, 'scheduledFor is not a valid date');
    if (leadMs < MIN_LEAD_MS) throw new ApiError(400, 'scheduledFor must be at least 30 minutes from now');
    if (leadMs > MAX_LEAD_MS) throw new ApiError(400, 'scheduledFor cannot be more than 14 days from now');
  }

  /*
   * Two pricing paths, and which one runs is decided by whether the customer
   * named a worker.
   *
   * The distance-based engine still prices every truck and hamali dispatch
   * exactly as before. The work-based engine prices a trade job from the
   * worker's OWN published rate — per square foot, per point, per task, or a
   * quotation total agreed in writing. Neither knows about the other, which
   * is why the original path below is untouched.
   */
  let fareBreakdown;
  let distanceKm: number | undefined;
  let frozenUnitDeclaration: string | undefined;
  let workFare: Awaited<ReturnType<typeof priceWork>> | undefined;

  if (pricingMode && workerId) {
    const profile = await WorkerPricingProfile.findOne({
      workerId,
      categorySlug: serviceCategorySlug,
      active: true,
    }).lean();
    if (!profile) throw new ApiError(404, 'That worker has not published rates for this service');

    workFare = await priceWork({ profile, mode: pricingMode, unitType, quantity, taskName, quotationId });

    // The measurement method freezes here, in the words the customer read:
    // the client sends back the exact declaration it displayed, and the
    // server falls back to its own canonical English if none came. What
    // settles an argument six weeks later is the sentence they agreed to,
    // not a slug.
    if (workFare.unitType) {
      frozenUnitDeclaration =
        typeof unitDeclaration === 'string' && unitDeclaration.trim()
          ? unitDeclaration.trim().slice(0, 400)
          : UNIT_DECLARATIONS[workFare.unitType].declaration;
    }

    // Expressed through the existing FareBreakdown shape so every downstream
    // reader — earnings, commission, invoice, ledger — keeps working unchanged.
    fareBreakdown = withServiceFee(
      { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: workFare.total, total: workFare.total },
      await getFeeSplit()
    );
  } else {
    ({ fareBreakdown, distanceKm } = await priceBooking({
      type,
      region,
      pickupLocation,
      dropLocation,
      stops,
      requiredVehicles,
      requiredHamaliCount,
    }));
  }

  const initialStatus = scheduledForDate ? 'scheduled' : 'searching';
  const booking = await Booking.create({
    customerId: req.user!.id, // never trust a client-supplied customerId
    type,
    region,
    serviceCategorySlug: serviceCategorySlug || undefined,
    pricingMode: pricingMode || undefined,
    unitType: workFare?.unitType,
    quantity: workFare ? workFare.billedQuantity : undefined,
    frozenUnitDeclaration,
    quotationId: quotationId || undefined,
    preferredWorkerId: workerId || undefined,
    cargoDetails,
    pickupLocation: { type: 'Point', coordinates: pickupLocation.coordinates, address: pickupLocation.address },
    dropLocation: { type: 'Point', coordinates: dropLocation.coordinates, address: dropLocation.address },
    stops: Array.isArray(stops) ? stops.map((s: { coordinates: [number, number]; address: string }) => ({ coordinates: s.coordinates, address: s.address })) : [],
    requiredVehicles: requiredVehicles ?? [],
    requiredHamaliCount: requiredHamaliCount ?? 0,
    status: initialStatus,
    fareBreakdown,
    distanceKm,
    statusHistory: [{ status: initialStatus, timestamp: new Date() }],
    scheduledFor: scheduledForDate,
    openForBidding: !!openForBidding,
    // Carried from Scan and Diagnose, when the customer came that way.
    // The assigned worker sees both before they set out.
    diagnosisPhotoUrl: diagnosisPhotoUrl || undefined,
    diagnosisSummary: diagnosisSummary || undefined,
  });

  // A scheduled booking's matching is deliberately deferred —
  // scheduledBooking.service.ts's release loop starts offers once
  // scheduledFor arrives, not now. An open-for-bidding booking's matching
  // is deliberately skipped entirely — Phase 3's push-offer engine offers
  // at the fixed computed fareBreakdown.total, which doesn't make sense
  // for a booking whose whole point is letting workers propose their own
  // price instead. It's still visible on the ordinary browse list AND on
  // GET /api/loadboard; workers place a Bid instead of hitting accept.
  // A directly-hired job is offered to its worker and to nobody else, so the
  // sequential offer engine is skipped entirely for it.
  if (!scheduledForDate && !booking.openForBidding && !booking.preferredWorkerId) {
    // Kick off Phase 3's sequential-timed-offer flow immediately — fire and
    // forget from the HTTP handler's perspective (the booking is already
    // created and returned to the customer regardless of matching progress;
    // matching itself is inherently async and observed via socket pushes /
    // the existing poll endpoints, never blocks the create response). Errors
    // here are the same "best-effort push" class as every realtime emitter —
    // logged, not surfaced to the customer as a booking-creation failure.
    if (booking.type === 'truck' || booking.type === 'combo') {
      startVehicleOffers(booking).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('startVehicleOffers failed:', err);
      });
    }
    if (booking.type === 'hamali' || booking.type === 'combo') {
      startHamaliOffers(booking).catch((err) => {
        // eslint-disable-next-line no-console
        console.error('startHamaliOffers failed:', err);
      });
    }
  }

  res.status(201).json({ booking });
});

export const listMyBookings = asyncHandler(async (req: Request, res: Response) => {
  const bookings = await Booking.find({ customerId: req.user!.id }).sort({ createdAt: -1 });
  res.status(200).json({ bookings });
});

/**
 * GET /api/bookings/frequent-routes — Phase 2 customer profile addition.
 * Real aggregation over the customer's own booking history (pickup/drop
 * address pairs, by frequency), not a separate saved-preference the
 * customer has to maintain — it reflects what they've actually booked
 * before, updating itself as their real usage does.
 */
export const getMyFrequentRoutes = asyncHandler(async (req: Request, res: Response) => {
  // Aggregation pipelines don't auto-cast a string to ObjectId the way
  // .find()/.findOne() do — this needs an explicit cast or $match silently
  // matches nothing.
  const routes = await Booking.aggregate([
    { $match: { customerId: new Types.ObjectId(req.user!.id) } },
    {
      $group: {
        _id: { pickup: '$pickupLocation.address', drop: '$dropLocation.address' },
        count: { $sum: 1 },
        lastUsedAt: { $max: '$createdAt' },
      },
    },
    { $sort: { count: -1, lastUsedAt: -1 } },
    { $limit: 5 },
    { $project: { _id: 0, pickup: '$_id.pickup', drop: '$_id.drop', count: 1, lastUsedAt: 1 } },
  ]);
  res.status(200).json({ routes });
});

export const getMyBooking = asyncHandler(async (req: Request, res: Response) => {
  // Scoped by customerId from the JWT, not just the :id param, so one
  // customer can never fetch another's booking by guessing/enumerating ids.
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  // The completion code is the customer's to hand over; it appears only
  // here, only to the booking's own customer, only while work is under way.
  const completionCode = booking.status === 'in_progress' ? await revealCompletionCode(booking._id.toString()) : null;
  res.status(200).json({ booking, completionCode, autoConfirmHours: env.AUTO_CONFIRM_HOURS });
});

/**
 * POST /api/bookings/:id/confirm-completion — the customer says the job is
 * done. Moves awaiting_confirmation -> completed and settles.
 */
export const confirmCompletion = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id }).select('status settlementHeld');
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'awaiting_confirmation') {
    throw new ApiError(400, `There is nothing to confirm on a booking that is ${booking.status}`);
  }
  if (booking.settlementHeld || (await hasActiveDispute(booking._id.toString()))) {
    throw new ApiError(409, 'A problem is open on this job. It will be settled when that is resolved.');
  }
  const completed = await finalizeCompletion(booking._id.toString(), 'customer', { id: req.user!.id, role: req.user!.role });
  if (!completed) throw new ApiError(409, 'This job was already completed');
  res.status(200).json({ booking: completed });
});

/**
 * POST /api/bookings/:id/report-problem — the customer says the job is NOT
 * done properly. Opens a dispute with the system's own record attached and
 * holds settlement (and auto-confirm) until it is resolved.
 */
export const reportProblem = asyncHandler(async (req: Request, res: Response) => {
  const { description } = req.body as { description: string };
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.status !== 'awaiting_confirmation') {
    throw new ApiError(400, 'A problem can be reported here while the job is waiting for your confirmation');
  }
  const dispute = await Dispute.create({
    bookingId: booking._id,
    raisedBy: req.user!.id,
    claim: description,
    priority: 'high',
    status: 'open',
    systemRecord: {
      status: booking.status,
      fareTotal: booking.fareBreakdown.total,
      distanceKm: booking.distanceKm,
      pickupAddress: booking.pickupLocation.address,
      dropAddress: booking.dropLocation.address,
      statusHistory: booking.statusHistory,
    },
    communicationLog: [],
  });
  booking.settlementHeld = true;
  await booking.save();
  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'completion_disputed',
    targetType: 'Booking',
    targetId: booking._id.toString(),
    details: { disputeId: dispute._id.toString() },
  });
  emitBookingStatus(booking);
  res.status(201).json({ booking, dispute });
});

/**
 * GET /api/bookings/:id/tax-invoice — Phase 6.4. Own booking only
 * (scoped by customerId, same pattern as getMyBooking above), and only
 * once a real successful Payment exists for it — an invoice is generated
 * from what was actually charged/collected (Payment.amount), never a
 * hypothetical pre-payment estimate. See taxInvoice.service.ts's doc
 * comment for the full GST-treatment rationale and its disclaimer.
 */
export const downloadTaxInvoice = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');

  const payment = await Payment.findOne({ bookingId: booking._id, status: 'success' }).sort({ createdAt: -1 });
  if (!payment) throw new ApiError(400, 'No successful payment found for this booking yet — a tax invoice can only be issued for a paid booking');

  const customer = await User.findById(req.user!.id).select('name businessProfile');
  if (!customer) throw new ApiError(404, 'Customer account not found');

  const pdf = await generateTaxInvoicePdf(booking, customer, payment);
  res.setHeader('Content-Type', 'application/pdf');
  // The API's CSP (default-src 'none') would blank the browser's PDF viewer.
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Content-Disposition', `attachment; filename="tax-invoice-${booking._id.toString().slice(-8)}.pdf"`);
  res.status(200).send(pdf);
});

export const cancelMyBooking = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (['completed', 'cancelled'].includes(booking.status)) {
    throw new ApiError(400, `Cannot cancel a booking that is already ${booking.status}`);
  }
  // The work is done; cancelling now would walk away from paying for it.
  // A customer who is unhappy reports a problem instead.
  if (booking.status === 'awaiting_confirmation') {
    throw new ApiError(400, 'The worker has finished this job. Confirm it or report a problem instead of cancelling.');
  }

  booking.status = 'cancelled';
  booking.statusHistory.push({ status: 'cancelled', timestamp: new Date() });
  await booking.save();

  // Fire-and-forget — never blocks a legitimate cancel on a detector issue.
  detectAbnormalCancellationRate(req.user!.id).catch(() => {});

  res.status(200).json({ booking });
});


/**
 * Workmanship guarantee — status and claim.
 *
 * Both are customer-side and scoped to the caller's own booking. The status
 * read is what lets the tracking screen say something true ("6 days left",
 * "the window closed on the 14th", "already claimed") instead of hiding a
 * promise the app already made on the dashboard.
 */
export const getGuaranteeStatus = asyncHandler(async (req: Request, res: Response) => {
  const booking = await Booking.findOne({ _id: req.params.id, customerId: req.user!.id });
  if (!booking) throw new ApiError(404, 'Booking not found');
  res.status(200).json({ guarantee: await guaranteeStatusFor(booking) });
});

export const raiseGuaranteeClaim = asyncHandler(async (req: Request, res: Response) => {
  const { description } = req.body as { description: string };
  const complaint = await claimGuarantee(req.user!.id, req.params.id, description);
  res.status(201).json({ complaintId: complaint._id.toString() });
});
