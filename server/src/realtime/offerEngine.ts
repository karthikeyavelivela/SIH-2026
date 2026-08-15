import { Booking, IBooking } from '../models/Booking';
import { Mutha } from '../models/Mutha';
import {
  findCandidateVehicles,
  findCandidateHamaliSolos,
  findCandidateMuthas,
} from '../services/matching.service';
import { acceptAsDriver, acceptAsHamaliSolo } from '../services/bookingAssignment.service';
import { ApiError } from '../utils/ApiError';
import { emitBookingOffer, emitOfferClosed, emitBookingMatched } from './emitters';
import { SEARCH_RADIUS_KM } from '../controllers/requests.controller';

/** Spec: "~20 seconds (configurable constant)". */
export const OFFER_TIMEOUT_MS = 20_000;

type Component = 'vehicle' | 'hamali';

interface OfferState {
  bookingId: string;
  component: Component;
  queue: string[]; // remaining candidate user ids, nearest-first
  currentCandidateId: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  /** hamali only: once the solo queue is exhausted, further offers go to Mutha leaders instead (see module doc comment). */
  phase: 'solo' | 'mutha';
}

// In-memory, single-instance — same documented tradeoff as this codebase's
// other Phase-2-era in-memory state (the rate limiters' default store).
// Horizontal scaling needs a shared store (Redis) so a second instance
// can see/advance the same offer; out of scope until that's needed.
const activeOffers = new Map<string, OfferState>();

function key(bookingId: string, component: Component): string {
  return `${bookingId}:${component}`;
}

function clearState(state: OfferState): void {
  if (state.timer) clearTimeout(state.timer);
  activeOffers.delete(key(state.bookingId, state.component));
}

// ---- Vehicle (truck/combo) sequential offer ----

export async function startVehicleOffers(booking: IBooking): Promise<void> {
  if (booking.assignedDriverIds.length > 0) return; // already filled (e.g. accepted via browse before this ran)
  const requiredCapacityKg = booking.requiredVehicles[0]?.capacityKg;
  if (!requiredCapacityKg) return;

  const candidates = await findCandidateVehicles({
    pickup: booking.pickupLocation.coordinates,
    requiredCapacityKg,
    maxDistanceKm: SEARCH_RADIUS_KM,
  });
  const queue = candidates
    .map((v) => v.ownerId.toString())
    .filter((id) => !booking.rejectedByUserIds.some((r) => r.toString() === id));

  const state: OfferState = {
    bookingId: booking._id.toString(),
    component: 'vehicle',
    queue,
    currentCandidateId: null,
    timer: null,
    phase: 'solo',
  };
  activeOffers.set(key(state.bookingId, 'vehicle'), state);
  await advanceVehicleOffer(state);
}

async function advanceVehicleOffer(state: OfferState): Promise<void> {
  const booking = await Booking.findById(state.bookingId);
  if (!booking || !['requested', 'searching'].includes(booking.status) || booking.assignedDriverIds.length > 0) {
    clearState(state);
    return;
  }

  const nextCandidateId = state.queue.shift();
  if (!nextCandidateId) {
    // Queue exhausted, nobody accepted — booking stays 'searching', honest
    // per the product principle: no fake match, customer keeps waiting.
    clearState(state);
    return;
  }

  state.currentCandidateId = nextCandidateId;
  emitBookingOffer(nextCandidateId, {
    bookingId: state.bookingId,
    type: booking.type,
    pickupAddress: booking.pickupLocation.address,
    dropAddress: booking.dropLocation.address,
    distanceKm: booking.distanceKm,
    total: booking.fareBreakdown.total,
    expiresAt: Date.now() + OFFER_TIMEOUT_MS,
  });

  state.timer = setTimeout(() => {
    void handleVehicleOfferTimeout(state);
  }, OFFER_TIMEOUT_MS);
}

async function handleVehicleOfferTimeout(state: OfferState): Promise<void> {
  if (state.currentCandidateId) emitOfferClosed(state.currentCandidateId, state.bookingId, 'timeout');
  await advanceVehicleOffer(state);
}

export async function respondToVehicleOffer(bookingId: string, userId: string, accept: boolean): Promise<void> {
  const state = activeOffers.get(key(bookingId, 'vehicle'));
  if (!state || state.currentCandidateId !== userId) {
    throw new ApiError(409, "This offer is no longer yours to respond to — it may have already expired.");
  }
  if (state.timer) clearTimeout(state.timer);

  if (!accept) {
    await advanceVehicleOffer(state);
    return;
  }

  try {
    const booking = await acceptAsDriver(userId, bookingId);
    clearState(state);
    await emitBookingMatched(booking);
  } catch (err) {
    // Booking was taken through another channel (browse-mode accept) or the
    // driver went offline between the offer and the response — same
    // outcome as a decline: move on to the next candidate.
    if (err instanceof ApiError) {
      await advanceVehicleOffer(state);
      return;
    }
    throw err;
  }
}

// ---- Hamali (hamali/combo) sequential offer ----
// Solo hamalis are offered one at a time, each filling exactly one slot.
// Once the solo candidate pool near the pickup is exhausted with slots
// still remaining, offers move to Mutha leaders (who fill the rest of the
// remaining count in one accept via the member-picker). This two-phase
// design is a deliberate Phase 3 simplification — a single unified
// nearest-first ranking across individuals AND groups isn't well-defined
// (groups don't have one location; matching.service ranks them by online
// qualifying member COUNT, not distance) — documented here rather than
// silently picked.

export async function startHamaliOffers(booking: IBooking): Promise<void> {
  const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
  if (remaining <= 0) return;

  const soloCandidates = await findCandidateHamaliSolos({
    pickup: booking.pickupLocation.coordinates,
    maxDistanceKm: SEARCH_RADIUS_KM,
  });
  const queue = soloCandidates
    .map((p) => p.userId.toString())
    .filter((id) => !booking.rejectedByUserIds.some((r) => r.toString() === id));

  const state: OfferState = {
    bookingId: booking._id.toString(),
    component: 'hamali',
    queue,
    currentCandidateId: null,
    timer: null,
    phase: 'solo',
  };
  activeOffers.set(key(state.bookingId, 'hamali'), state);
  await advanceHamaliOffer(state);
}

async function advanceHamaliOffer(state: OfferState): Promise<void> {
  const booking = await Booking.findById(state.bookingId);
  if (!booking || !['requested', 'searching'].includes(booking.status)) {
    clearState(state);
    return;
  }
  const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
  if (remaining <= 0) {
    clearState(state);
    return;
  }

  let nextCandidateId = state.queue.shift();

  if (!nextCandidateId && state.phase === 'solo') {
    // Solo pool exhausted — move to Mutha leaders for the rest.
    state.phase = 'mutha';
    const muthas = await findCandidateMuthas({
      pickup: booking.pickupLocation.coordinates,
      maxDistanceKm: SEARCH_RADIUS_KM,
      requiredHamaliCount: remaining,
    });
    const leaderIds = await Promise.all(
      muthas.map(async (m) => {
        const fresh = await Mutha.findById(m._id).select('leaderId').lean();
        return fresh?.leaderId.toString();
      })
    );
    state.queue = leaderIds.filter((id): id is string => !!id);
    nextCandidateId = state.queue.shift();
  }

  if (!nextCandidateId) {
    clearState(state); // exhausted both pools — booking stays 'searching', honestly
    return;
  }

  state.currentCandidateId = nextCandidateId;
  emitBookingOffer(nextCandidateId, {
    bookingId: state.bookingId,
    type: booking.type,
    pickupAddress: booking.pickupLocation.address,
    dropAddress: booking.dropLocation.address,
    distanceKm: booking.distanceKm,
    total: booking.fareBreakdown.total,
    expiresAt: Date.now() + OFFER_TIMEOUT_MS,
  });

  state.timer = setTimeout(() => {
    void handleHamaliOfferTimeout(state);
  }, OFFER_TIMEOUT_MS);
}

async function handleHamaliOfferTimeout(state: OfferState): Promise<void> {
  if (state.currentCandidateId) emitOfferClosed(state.currentCandidateId, state.bookingId, 'timeout');
  await advanceHamaliOffer(state);
}

/** Solo-hamali accept/reject in response to a pushed offer (single tap, one slot). */
export async function respondToHamaliOffer(bookingId: string, userId: string, accept: boolean): Promise<void> {
  const state = activeOffers.get(key(bookingId, 'hamali'));
  if (!state || state.currentCandidateId !== userId || state.phase !== 'solo') {
    throw new ApiError(409, "This offer is no longer yours to respond to — it may have already expired.");
  }
  if (state.timer) clearTimeout(state.timer);

  if (!accept) {
    await advanceHamaliOffer(state);
    return;
  }

  try {
    const booking = await acceptAsHamaliSolo(userId, bookingId);
    if (booking.status === 'accepted' || booking.assignedHamaliIds.length >= booking.requiredHamaliCount) {
      clearState(state);
      await emitBookingMatched(booking);
    } else {
      // Slot filled, more still needed — keep offering for the rest.
      await advanceHamaliOffer(state);
    }
  } catch (err) {
    if (err instanceof ApiError) {
      await advanceHamaliOffer(state);
      return;
    }
    throw err;
  }
}

/**
 * A Mutha leader's response to a pushed hamali offer is NOT a plain
 * accept/reject tap — accepting opens the same member-picker the browse
 * flow uses (spec: "Assign specific member(s)... including splitting one
 * group across multiple concurrent job sites"), so this just tells the
 * offer engine the leader either declined outright or has taken the offer
 * off the clock to assign members (the real assignment still goes through
 * POST /api/requests/:id/accept with memberIds, same as browse-mode,
 * which is what actually clears/advances the queue via
 * notifyMuthaOfferSettled below).
 */
export async function respondToMuthaHamaliOffer(bookingId: string, userId: string, accept: boolean): Promise<void> {
  const state = activeOffers.get(key(bookingId, 'hamali'));
  if (!state || state.currentCandidateId !== userId || state.phase !== 'mutha') {
    throw new ApiError(409, "This offer is no longer yours to respond to — it may have already expired.");
  }
  if (!accept) {
    if (state.timer) clearTimeout(state.timer);
    await advanceHamaliOffer(state);
    return;
  }
  // Accept: stop the countdown (leader is now in the member-picker) but
  // leave state.currentCandidateId set so the eventual REST accept call
  // (via acceptAsMuthaLeader) is recognized as settling THIS offer.
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
}

/**
 * Called from the REST accept/reject handlers after a Mutha leader's real
 * assignment (or explicit reject) resolves, so the offer queue advances
 * (on a failed/partial assignment) or clears (on success) instead of
 * hanging forever once the countdown was already stopped by
 * respondToMuthaHamaliOffer above.
 */
export async function notifyMuthaOfferSettled(bookingId: string, userId: string, booking: IBooking): Promise<void> {
  const state = activeOffers.get(key(bookingId, 'hamali'));
  if (!state || state.currentCandidateId !== userId || state.phase !== 'mutha') return;

  const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
  if (remaining <= 0) {
    clearState(state);
  } else {
    await advanceHamaliOffer(state);
  }
}

/** Test/debug hook — not used by production code paths. */
export function _clearAllOffersForTests(): void {
  for (const state of activeOffers.values()) {
    if (state.timer) clearTimeout(state.timer);
  }
  activeOffers.clear();
}
