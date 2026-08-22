import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Booking } from '../models/Booking';
import { Bid } from '../models/Bid';
import { Vehicle } from '../models/Vehicle';
import { HamaliProfile } from '../models/HamaliProfile';
import { acceptAsDriver, acceptAsHamaliSolo } from '../services/bookingAssignment.service';
import { emitBookingMatched } from '../realtime/emitters';

const openStatus = { $in: ['requested', 'searching'] };

// A bid this many times the booking's own reference price (fareBreakdown.total,
// the platform's normal computed fare) or higher is rejected outright — not
// a hard business rule from the spec, just a sanity ceiling against a typo
// or an abusive bid (same "cheap ceiling against abuse" rationale as
// requests.controller.ts's MAX_PROOF_PHOTO_BYTES). A genuine below-market
// bid has no floor beyond Bid.amount's own min:1 — undercutting is the
// entire point of a load board.
const MAX_BID_MULTIPLE = 3;

/**
 * GET /api/loadboard — open-for-bidding bookings the caller's role is
 * eligible to bid on. Deliberately a much simpler eligibility filter than
 * requests.controller.ts's listRequests (no geo radius/willing-location
 * matching yet) — a driver/hamali_solo sees every open-for-bidding booking
 * of their type, platform-wide, and decides for themselves whether the
 * pickup is worth traveling to before bidding. Each booking is annotated
 * with the caller's own pending bid (if any), so the client can show
 * "you bid ₹X" instead of a bare "place a bid" button.
 */
export const listLoadBoard = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;

  const typeFilter =
    role === 'driver' ? ['truck'] : role === 'hamali_solo' ? ['hamali'] : null;
  if (!typeFilter) throw new ApiError(403, 'This role does not participate in the load board');

  const bookings = await Booking.find({
    status: openStatus,
    openForBidding: true,
    type: { $in: typeFilter },
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const bookingIds = bookings.map((b) => b._id);
  const myBids = await Bid.find({ bookingId: { $in: bookingIds }, bidderId: userId, status: 'pending' }).lean();
  const myBidByBooking = new Map(myBids.map((b) => [b.bookingId.toString(), b]));

  res.status(200).json({
    loads: bookings.map((b) => ({ ...b, myBid: myBidByBooking.get(b._id.toString()) ?? null })),
  });
});

async function assertEligibleBidder(userId: string, role: string, booking: { type: string }): Promise<void> {
  if (role === 'driver') {
    if (booking.type !== 'truck') throw new ApiError(400, 'This load does not need a driver bid');
    const vehicle = await Vehicle.findOne({ ownerId: userId });
    if (!vehicle) throw new ApiError(404, 'No vehicle found for this driver');
    if (vehicle.availabilityStatus !== 'online') throw new ApiError(400, 'Go online before placing a bid');
    if (vehicle.complianceStatus === 'non_compliant') {
      throw new ApiError(400, 'This vehicle failed its last compliance inspection — get it re-inspected before bidding');
    }
  } else if (role === 'hamali_solo') {
    if (booking.type !== 'hamali') throw new ApiError(400, 'This load does not need a hamali bid');
    const profile = await HamaliProfile.findOne({ userId, type: 'solo' });
    if (!profile) throw new ApiError(404, 'No hamali profile found for this user');
    if (profile.availabilityStatus !== 'online') throw new ApiError(400, 'Go online before placing a bid');
  } else {
    throw new ApiError(403, 'This role does not participate in the load board');
  }
}

/**
 * POST /api/loadboard/:bookingId/bids — place or update the caller's own
 * pending bid on one booking. Upserts on {bookingId, bidderId, status:
 * 'pending'} (see Bid.ts's partial unique index) so re-submitting before
 * the customer decides just updates the same row rather than creating a
 * second competing one from the same bidder.
 */
export const placeBid = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { bookingId } = req.params;
  const { amount, message } = req.body as { amount: number; message?: string };

  const booking = await Booking.findOne({ _id: bookingId, status: openStatus, openForBidding: true });
  if (!booking) throw new ApiError(404, 'This load is not open for bidding');

  await assertEligibleBidder(userId, role, booking);

  const ceiling = booking.fareBreakdown.total * MAX_BID_MULTIPLE;
  if (booking.fareBreakdown.total > 0 && amount > ceiling) {
    throw new ApiError(400, `Bid too high — must be at most ₹${ceiling.toFixed(2)} (${MAX_BID_MULTIPLE}x the reference fare)`);
  }

  const bid = await Bid.findOneAndUpdate(
    { bookingId, bidderId: userId, status: 'pending' },
    { $set: { amount, message, bidderRole: role, status: 'pending' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({ bid });
});

/**
 * POST /api/loadboard/:bookingId/bids/:bidId/withdraw — bidder-only, own
 * bid, pending -> withdrawn. A withdrawn bid can be re-placed later
 * (placeBid's upsert only matches status:'pending' rows).
 */
export const withdrawBid = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { bookingId, bidId } = req.params;

  const bid = await Bid.findOneAndUpdate(
    { _id: bidId, bookingId, bidderId: userId, status: 'pending' },
    { status: 'withdrawn' },
    { new: true }
  );
  if (!bid) throw new ApiError(404, 'Bid not found or already settled');
  res.status(200).json({ bid });
});

/**
 * GET /api/loadboard/:bookingId/bids — the booking's own customer (or
 * admin) reviewing every pending bid, cheapest first, with the bidder's
 * public-safe fields populated (name/rating — same field allowlist as
 * requests.controller.ts's myAssignedBookings customer populate, mirrored
 * for the bidder side).
 */
export const listBidsForBooking = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const role = req.user!.role;
  const { bookingId } = req.params;

  const booking = await Booking.findById(bookingId).select('customerId').lean();
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (role !== 'admin' && booking.customerId.toString() !== userId) {
    throw new ApiError(403, 'You do not own this booking');
  }

  const bids = await Bid.find({ bookingId, status: 'pending' })
    .sort({ amount: 1 })
    .populate<{ bidderId: { _id: unknown; name: string; ratingAvg: number; ratingCount: number } }>(
      'bidderId',
      'name ratingAvg ratingCount'
    );

  res.status(200).json({ bids });
});

/**
 * POST /api/loadboard/:bookingId/bids/:bidId/accept — the customer picks a
 * winning bid. Clears openForBidding and re-prices fareBreakdown.total to
 * the winning bid amount BEFORE calling the existing
 * acceptAsDriver/acceptAsHamaliSolo — those functions' own atomic
 * $findOneAndUpdate guard now matches (openForBidding is no longer true),
 * so a stale/now-unavailable bidder still correctly 409s exactly like a
 * normal accept race would, rather than this endpoint reimplementing that
 * guard a second, possibly-inconsistent way.
 */
export const acceptBid = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { bookingId, bidId } = req.params;

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new ApiError(404, 'Booking not found');
  if (booking.customerId.toString() !== userId) throw new ApiError(403, 'You do not own this booking');
  if (!booking.openForBidding) throw new ApiError(400, 'This booking is not open for bidding');

  const bid = await Bid.findOne({ _id: bidId, bookingId, status: 'pending' });
  if (!bid) throw new ApiError(404, 'Bid not found or already settled');

  // fareBreakdown.total is the sole authoritative charged amount (see
  // fare.service.ts's FareBreakdown doc comment) — the individual
  // components are scaled proportionally to the new total purely for
  // display, exactly the pattern that comment already prescribes for any
  // caller needing them to visually sum.
  const oldFareBreakdown = booking.fareBreakdown;
  const scale = oldFareBreakdown.total > 0 ? bid.amount / oldFareBreakdown.total : 1;
  booking.fareBreakdown = {
    baseFare: Math.round(oldFareBreakdown.baseFare * scale * 100) / 100,
    distanceFare: Math.round(oldFareBreakdown.distanceFare * scale * 100) / 100,
    hamaliFare: Math.round(oldFareBreakdown.hamaliFare * scale * 100) / 100,
    surgeMultiplier: oldFareBreakdown.surgeMultiplier,
    total: bid.amount,
  };
  booking.openForBidding = false;
  await booking.save();

  const assign = bid.bidderRole === 'driver' ? acceptAsDriver : acceptAsHamaliSolo;
  let assignedBooking;
  try {
    assignedBooking = await assign(bid.bidderId.toString(), bookingId);
  } catch (err) {
    // The winning bidder became unavailable between "customer clicked
    // accept" and this write (went offline, vehicle failed inspection,
    // someone else's separate accept won the race) — put the booking back
    // exactly how bidding left it rather than stranding it in a broken
    // "not open for bidding, but also not assigned" state. The bid itself
    // stays 'pending' (untouched above) so the customer can pick a
    // different one or the same bidder can go online and re-win it.
    booking.fareBreakdown = oldFareBreakdown;
    booking.openForBidding = true;
    await booking.save();
    throw err;
  }

  bid.status = 'accepted';
  await bid.save();
  await Bid.updateMany({ bookingId, status: 'pending', _id: { $ne: bid._id } }, { status: 'rejected' });

  await emitBookingMatched(assignedBooking);
  res.status(200).json({ booking: assignedBooking, bid });
});
