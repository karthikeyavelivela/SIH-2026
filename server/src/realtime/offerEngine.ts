import { Booking, IBooking } from '../models/Booking';
import { isEligible, requiredSkillsFor } from '../services/workerEligibility';
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
import { workerRateOf } from '../services/serviceFee.service';
import { env } from '../config/env';
import { randomUUID } from 'crypto';
import { getRedis } from '../infra/redis';

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
  /** P1.4 — urgent: widening rings and a shorter countdown. */
  urgent: boolean;
  radii: number[];
  ring: number;
  /** Everyone already offered this booking, so a wider ring never repeats them. */
  offered: Set<string>;
  /** Bumped on every new offer. A timer that fires for an older number is stale and does nothing. */
  seq: number;
  /** The countdown's callback, kept so a test can fire it without waiting. Never stored in Redis. */
  fire?: () => Promise<void>;
}

/*
 * Where offer state lives.
 *
 * Always in this process's memory (the timer has to be here). When REDIS_URL
 * is set it is ALSO written to Redis after every change, and Redis is treated
 * as the truth whenever a response arrives: a worker's tap can land on a
 * different instance from the one that sent the offer, so that instance reads
 * the state from Redis, checks it really is this worker's turn, and carries on
 * from there.
 *
 * Two guards make that safe. `seq` is bumped on every offer, so a countdown
 * that fires on the instance that started it after another instance has
 * already moved on sees a different number and does nothing. And any change to
 * one booking's offer takes a short lock in Redis, so two instances cannot
 * both advance it at once. Without Redis none of this runs and behaviour is
 * exactly what it was.
 *
 * If the instance holding a countdown dies, the offer simply lapses when its
 * Redis key expires and the booking stays open for anyone to take from the
 * job list, the same honest outcome as running out of candidates.
 */
const activeOffers = new Map<string, OfferState>();

const OFFER_TTL_SECONDS = 15 * 60;
const LOCK_MS = 15_000;

function key(bookingId: string, component: Component): string {
  return `${bookingId}:${component}`;
}

const redisKey = (bookingId: string, component: Component) => `offer:${key(bookingId, component)}`;

type PersistedOffer = Omit<OfferState, 'timer' | 'fire' | 'offered'> & { offered: string[] };

async function persist(state: OfferState): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const { timer: _timer, fire: _fire, offered, ...rest } = state;
  const body: PersistedOffer = { ...rest, offered: [...offered] };
  await redis.set(redisKey(state.bookingId, state.component), JSON.stringify(body), 'EX', OFFER_TTL_SECONDS);
}

async function loadFromRedis(bookingId: string, component: Component): Promise<OfferState | null> {
  const redis = getRedis();
  if (!redis) return null;
  const raw = await redis.get(redisKey(bookingId, component));
  if (!raw) return null;
  const p = JSON.parse(raw) as PersistedOffer;
  return { ...p, offered: new Set(p.offered), timer: null };
}

/**
 * The current state of a booking's offer. With Redis that is the stored state
 * (adopting it here if this instance did not start the offer, or replacing a
 * local copy that has fallen behind); without Redis it is the local one.
 */
async function lookup(bookingId: string, component: Component): Promise<OfferState | undefined> {
  const local = activeOffers.get(key(bookingId, component));
  if (!getRedis()) return local;
  const fresh = await loadFromRedis(bookingId, component);
  if (!fresh) {
    if (local) {
      if (local.timer) clearTimeout(local.timer);
      activeOffers.delete(key(bookingId, component));
    }
    return undefined;
  }
  if (local && local.seq === fresh.seq) return local;
  if (local?.timer) clearTimeout(local.timer);
  activeOffers.set(key(bookingId, component), fresh);
  return fresh;
}

async function clearState(state: OfferState): Promise<void> {
  if (state.timer) clearTimeout(state.timer);
  activeOffers.delete(key(state.bookingId, state.component));
  await getRedis()?.del(redisKey(state.bookingId, state.component));
}

/** Runs fn holding the booking's offer lock. Returns false (and does not run fn) when another instance holds it. */
async function withOfferLock<T>(bookingId: string, component: Component, fn: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
  const redis = getRedis();
  if (!redis) return { ran: true, value: await fn() };
  const lockKey = `offerlock:${key(bookingId, component)}`;
  const token = randomUUID();
  if ((await redis.set(lockKey, token, 'PX', LOCK_MS, 'NX')) !== 'OK') return { ran: false };
  try {
    return { ran: true, value: await fn() };
  } finally {
    if ((await redis.get(lockKey)) === token) await redis.del(lockKey);
  }
}

const BUSY = "This offer is being handled right now — please try again in a moment.";

async function lockedOrBusy<T>(bookingId: string, component: Component, fn: () => Promise<T>): Promise<T> {
  const r = await withOfferLock(bookingId, component, fn);
  if (!r.ran) throw new ApiError(409, BUSY);
  return r.value;
}

/** Starts the countdown for the offer just made. The handler runs only if this offer is still the current one. */
function armTimer(state: OfferState, handler: (s: OfferState) => Promise<void>): void {
  const seq = state.seq;
  const fire = async () => {
    // Whoever runs this (the timer, or a test), the pending countdown is spent.
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    const redis = getRedis();
    if (redis) {
      const fresh = await loadFromRedis(state.bookingId, state.component);
      if (!fresh || fresh.seq !== seq) {
        // Another instance moved on, or the offer is gone. Drop our copy.
        if (activeOffers.get(key(state.bookingId, state.component)) === state) activeOffers.delete(key(state.bookingId, state.component));
        return;
      }
    }
    await withOfferLock(state.bookingId, state.component, () => handler(state));
  };
  state.fire = fire;
  state.timer = setTimeout(() => {
    fire().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('offer timeout handler failed:', err);
    });
  }, timeoutFor(state));
}

/**
 * P1.4 — an urgent booking searches 3 km, then 6, then 10 (URGENT_RADII_KM),
 * then the ordinary radius, so it is never stranded; each ring adds only
 * people not yet offered. An ordinary booking has the one ordinary ring.
 */
function ringsFor(urgent: boolean): number[] {
  if (!urgent) return [SEARCH_RADIUS_KM];
  const rings = env.URGENT_RADII_KM.filter((r) => r < SEARCH_RADIUS_KM);
  return [...rings, SEARCH_RADIUS_KM];
}

function timeoutFor(state: OfferState): number {
  return state.urgent ? env.URGENT_OFFER_TIMEOUT_MS : OFFER_TIMEOUT_MS;
}

function newState(booking: IBooking, component: Component): OfferState {
  const urgent = !!booking.urgent;
  return {
    bookingId: booking._id.toString(),
    component,
    queue: [],
    currentCandidateId: null,
    timer: null,
    phase: 'solo',
    urgent,
    radii: ringsFor(urgent),
    ring: 0,
    offered: new Set(),
    seq: 0,
  };
}

function notYetAsked(booking: IBooking, state: OfferState, ids: string[]): string[] {
  return ids.filter((id) => !state.offered.has(id) && !booking.rejectedByUserIds.some((r) => r.toString() === id));
}

async function vehicleQueue(booking: IBooking, state: OfferState): Promise<string[]> {
  const requiredCapacityKg = booking.requiredVehicles[0]?.capacityKg;
  if (!requiredCapacityKg) return [];
  const candidates = await findCandidateVehicles({
    pickup: booking.pickupLocation.coordinates,
    requiredCapacityKg,
    maxDistanceKm: state.radii[state.ring],
  });
  return notYetAsked(booking, state, candidates.map((v) => v.ownerId.toString()));
}

async function hamaliSoloQueue(booking: IBooking, state: OfferState): Promise<string[]> {
  const soloCandidates = await findCandidateHamaliSolos({
    pickup: booking.pickupLocation.coordinates,
    maxDistanceKm: state.radii[state.ring],
  });
  // Only people who do this kind of work. Nearest-first used to mean a
  // plumbing job went to whichever loader was closest.
  const requiredSkills = await requiredSkillsFor(booking.serviceCategorySlug);
  return notYetAsked(
    booking,
    state,
    soloCandidates.filter((p) => isEligible(p, requiredSkills)).map((p) => p.userId.toString())
  );
}

/** Widens a search by one ring at a time until someone new is found; false when there is no wider ring. */
async function widen(
  booking: IBooking,
  state: OfferState,
  next: (b: IBooking, s: OfferState) => Promise<string[]>
): Promise<boolean> {
  while (state.ring < state.radii.length - 1) {
    state.ring += 1;
    state.queue = await next(booking, state);
    if (state.queue.length > 0) return true;
  }
  return false;
}

function offerPayload(booking: IBooking, state: OfferState) {
  return {
    bookingId: state.bookingId,
    type: booking.type,
    pickupAddress: booking.pickupLocation.address,
    dropAddress: booking.dropLocation.address,
    distanceKm: booking.distanceKm,
    // What the worker earns: their rate, not the customer's total with the service fee.
    total: workerRateOf(booking.fareBreakdown),
    expiresAt: Date.now() + timeoutFor(state),
    urgent: state.urgent,
    weightKg: booking.cargoDetails?.weightKg,
    goodsType: booking.cargoDetails?.goodsType,
    hamaliCount: booking.requiredHamaliCount,
  };
}

// ---- Vehicle (truck/combo) sequential offer ----

export async function startVehicleOffers(booking: IBooking): Promise<void> {
  if (booking.assignedDriverIds.length > 0) return; // already filled (e.g. accepted via browse before this ran)
  if (!booking.requiredVehicles[0]?.capacityKg) return;

  const state = newState(booking, 'vehicle');
  state.queue = await vehicleQueue(booking, state);
  activeOffers.set(key(state.bookingId, 'vehicle'), state);
  await advanceVehicleOffer(state);
}

async function advanceVehicleOffer(state: OfferState): Promise<void> {
  const booking = await Booking.findById(state.bookingId);
  if (!booking || !['requested', 'searching'].includes(booking.status) || booking.assignedDriverIds.length > 0) {
    await clearState(state);
    return;
  }

  let nextCandidateId = state.queue.shift();
  if (!nextCandidateId && (await widen(booking, state, vehicleQueue))) nextCandidateId = state.queue.shift();
  if (!nextCandidateId) {
    // Queue exhausted, nobody accepted — booking stays 'searching', honest
    // per the product principle: no fake match, customer keeps waiting.
    await clearState(state);
    return;
  }

  state.currentCandidateId = nextCandidateId;
  state.offered.add(nextCandidateId);
  state.seq += 1;
  await persist(state);
  emitBookingOffer(nextCandidateId, offerPayload(booking, state));

  armTimer(state, handleVehicleOfferTimeout);
}

async function handleVehicleOfferTimeout(state: OfferState): Promise<void> {
  if (state.currentCandidateId) emitOfferClosed(state.currentCandidateId, state.bookingId, 'timeout');
  await advanceVehicleOffer(state);
}

export function respondToVehicleOffer(bookingId: string, userId: string, accept: boolean): Promise<void> {
  return lockedOrBusy(bookingId, 'vehicle', () => respondToVehicleOfferLocked(bookingId, userId, accept));
}

async function respondToVehicleOfferLocked(bookingId: string, userId: string, accept: boolean): Promise<void> {
  const state = await lookup(bookingId, 'vehicle');
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
    await clearState(state);
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

  const state = newState(booking, 'hamali');
  state.queue = await hamaliSoloQueue(booking, state);
  activeOffers.set(key(state.bookingId, 'hamali'), state);
  await advanceHamaliOffer(state);
}

async function advanceHamaliOffer(state: OfferState): Promise<void> {
  const booking = await Booking.findById(state.bookingId);
  if (!booking || !['requested', 'searching'].includes(booking.status)) {
    await clearState(state);
    return;
  }
  const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
  if (remaining <= 0) {
    await clearState(state);
    return;
  }

  let nextCandidateId = state.queue.shift();
  if (!nextCandidateId && state.phase === 'solo' && (await widen(booking, state, hamaliSoloQueue))) {
    nextCandidateId = state.queue.shift();
  }

  // A society is a loading crew. A trade or farm job that no individual
  // could take stays open honestly rather than being handed to a crew.
  const needsSpecificSkill = ((await requiredSkillsFor(booking.serviceCategorySlug)) ?? []).length > 0;

  if (!nextCandidateId && state.phase === 'solo' && !needsSpecificSkill) {
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
    await clearState(state); // exhausted both pools — booking stays 'searching', honestly
    return;
  }

  state.currentCandidateId = nextCandidateId;
  state.offered.add(nextCandidateId);
  state.seq += 1;
  await persist(state);
  emitBookingOffer(nextCandidateId, offerPayload(booking, state));

  armTimer(state, handleHamaliOfferTimeout);
}

async function handleHamaliOfferTimeout(state: OfferState): Promise<void> {
  if (state.currentCandidateId) emitOfferClosed(state.currentCandidateId, state.bookingId, 'timeout');
  await advanceHamaliOffer(state);
}

/** Solo-hamali accept/reject in response to a pushed offer (single tap, one slot). */
export function respondToHamaliOffer(bookingId: string, userId: string, accept: boolean): Promise<void> {
  return lockedOrBusy(bookingId, 'hamali', () => respondToHamaliOfferLocked(bookingId, userId, accept));
}

async function respondToHamaliOfferLocked(bookingId: string, userId: string, accept: boolean): Promise<void> {
  const state = await lookup(bookingId, 'hamali');
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
      await clearState(state);
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
export function respondToMuthaHamaliOffer(bookingId: string, userId: string, accept: boolean): Promise<void> {
  return lockedOrBusy(bookingId, 'hamali', () => respondToMuthaHamaliOfferLocked(bookingId, userId, accept));
}

async function respondToMuthaHamaliOfferLocked(bookingId: string, userId: string, accept: boolean): Promise<void> {
  const state = await lookup(bookingId, 'hamali');
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
  // Countdown stopped: bump the number so a timer still pending on another
  // instance is recognised as stale, and store that.
  state.seq += 1;
  await persist(state);
}

/**
 * Called from the REST accept/reject handlers after a Mutha leader's real
 * assignment (or explicit reject) resolves, so the offer queue advances
 * (on a failed/partial assignment) or clears (on success) instead of
 * hanging forever once the countdown was already stopped by
 * respondToMuthaHamaliOffer above.
 */
export function notifyMuthaOfferSettled(bookingId: string, userId: string, booking: IBooking): Promise<void> {
  return lockedOrBusy(bookingId, 'hamali', () => notifyMuthaOfferSettledLocked(bookingId, userId, booking));
}

async function notifyMuthaOfferSettledLocked(bookingId: string, userId: string, booking: IBooking): Promise<void> {
  const state = await lookup(bookingId, 'hamali');
  if (!state || state.currentCandidateId !== userId || state.phase !== 'mutha') return;

  const remaining = booking.requiredHamaliCount - booking.assignedHamaliIds.length;
  if (remaining <= 0) {
    await clearState(state);
  } else {
    await advanceHamaliOffer(state);
  }
}

/** Test hook: the rings and countdown a booking would get. */
export function _offerPlanFor(urgent: boolean): { radii: number[]; timeoutMs: number } {
  return { radii: ringsFor(urgent), timeoutMs: urgent ? env.URGENT_OFFER_TIMEOUT_MS : OFFER_TIMEOUT_MS };
}

/** Test hook: who is being offered a booking right now, and at which ring. */
export function _currentOfferFor(
  bookingId: string,
  component: Component
): { candidate: string | null; ring: number; radiusKm: number } | null {
  const st = activeOffers.get(key(bookingId, component));
  return st ? { candidate: st.currentCandidateId, ring: st.ring, radiusKm: st.radii[st.ring] } : null;
}

/** Test/debug hook — not used by production code paths. */
export function _clearAllOffersForTests(): void {
  for (const state of activeOffers.values()) {
    if (state.timer) clearTimeout(state.timer);
  }
  activeOffers.clear();
}

/**
 * Test hook: forget everything held in this process WITHOUT touching Redis,
 * which is what a second instance that never saw the offer looks like.
 */
export function _dropLocalOffersForTests(): void {
  for (const state of activeOffers.values()) {
    if (state.timer) clearTimeout(state.timer);
  }
  activeOffers.clear();
}

/** Test hook: run a booking's countdown callback now, as if its timer had just fired. */
export async function _fireOfferTimerForTests(bookingId: string, component: Component): Promise<void> {
  await activeOffers.get(key(bookingId, component))?.fire?.();
}
