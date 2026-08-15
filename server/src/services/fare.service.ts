import { ApiError } from '../utils/ApiError';

export type VehicleCategory = 'vehicle_small' | 'vehicle_medium' | 'vehicle_large';

/** Same three-tier split established by the Phase 1 driver-signup vehicleType field. */
export function bucketVehicleCategory(vehicleType: string): VehicleCategory {
  if (vehicleType === 'mini_truck') return 'vehicle_small';
  if (vehicleType === 'medium_truck') return 'vehicle_medium';
  if (vehicleType === 'large_truck') return 'vehicle_large';
  throw new ApiError(400, `Unknown vehicle type: ${vehicleType}`);
}

/**
 * Same three tiers as bucketVehicleCategory, bucketed directly from a
 * requested capacityKg instead of round-tripping through a manufactured
 * vehicleType string. This is what booking.controller.ts's createBooking
 * actually needs: a customer's booking request carries a required
 * capacity, not a real driver's vehicleType. An earlier version derived a
 * fake vehicleType string (`capacityKg <= 1000 ? 'mini_truck' : ...`) just
 * to feed bucketVehicleCategory, which added indirection with no benefit
 * and, worse, meant a malformed capacityKg (null, undefined, NaN) never
 * hit a validation guard — it just silently fell through the ternary
 * chain to a plausible-looking-but-wrong tier. This function validates
 * capacityKg directly instead.
 */
export function bucketVehicleCategoryFromCapacity(capacityKg: number): VehicleCategory {
  if (!Number.isFinite(capacityKg) || capacityKg <= 0) {
    throw new ApiError(400, `Invalid capacityKg: ${capacityKg}`);
  }
  if (capacityKg <= 1000) return 'vehicle_small';
  if (capacityKg <= 5000) return 'vehicle_medium';
  return 'vehicle_large';
}

interface RateComponent {
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  surgeMultiplier: number;
}

/**
 * `total` is the sole authoritative charged amount. The individual
 * components (baseFare/distanceFare/hamaliFare) are rounded independently
 * for display and will NOT always sum exactly to `total` — by up to a
 * paisa from rounding, or by a larger, deterministic amount whenever the
 * minimum-fare clamp is active (baseFare+distanceFare stay as the raw
 * pre-clamp figures even when the clamp raises the actual charged
 * component above their sum). A receipt/breakdown UI should render
 * `total` as-is and, if it needs the components to visually sum, scale
 * them proportionally at render time rather than trusting a raw sum.
 */
export interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  surgeMultiplier: number;
  hamaliFare: number;
  total: number;
}

interface ComputeFareInput {
  vehicleRule?: RateComponent;
  distanceKm?: number;
  hamaliRule?: RateComponent;
  hamaliCount?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Each present component (vehicle and/or hamali) computes its own PRE-SURGE
 * amount as max(minimumFare, baseFare + perKmRate*distanceKm), the two are
 * summed, and the whole sum is scaled once by a single surgeMultiplier to
 * get `total`. Every field in the returned breakdown — baseFare,
 * distanceFare, hamaliFare — is always pre-surge; only `total` reflects
 * surge. This is a deliberate, uniform convention: an earlier version of
 * this function returned hamaliFare pre-surge for combo bookings but
 * post-surge for hamali-only bookings, which silently produced two
 * different meanings for the same field depending on booking type. Never
 * do that again — if a caller needs a post-surge component for display,
 * compute it as `component * (total / preSurgeSubtotal)` at the call site,
 * don't bake an inconsistent convention back into this function.
 *
 * When both a vehicle and a hamali rule are present with DIFFERENT
 * surgeMultiplier values (possible once Phase 5 computes surge live and
 * per-category — FareRule's category enum already treats 'hamali' as
 * distinct from the vehicle categories), the higher of the two applies to
 * the whole booking. Rationale: surge exists to reflect scarcity/demand:
 * if either the vehicle side or the labor side of a combo booking is in a
 * high-demand state, the combined job genuinely is harder to fulfill than
 * either half alone, so under-charging by silently picking one side's
 * multiplier (what the original implementation did, unintentionally) would
 * be the wrong direction to be wrong in. This choice is covered by a test
 * so a future refactor can't silently reintroduce the drop.
 *
 * Phase 2 always has surgeMultiplier=1.0 on every FareRule (no admin API
 * to set it otherwise yet) — this function just reads whatever the rule
 * says, so Phase 5 only has to change what writes that field, not this
 * read path.
 */
export function computeFareBreakdown(input: ComputeFareInput): FareBreakdown {
  const { vehicleRule, distanceKm = 0, hamaliRule, hamaliCount = 0 } = input;

  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new ApiError(400, `Invalid distanceKm: ${distanceKm}`);
  }
  if (!Number.isFinite(hamaliCount) || hamaliCount < 0) {
    throw new ApiError(400, `Invalid hamaliCount: ${hamaliCount}`);
  }

  let baseFare = 0;
  let distanceFare = 0;
  let vehicleComponent = 0;

  if (vehicleRule) {
    baseFare = vehicleRule.baseFare;
    distanceFare = vehicleRule.perKmRate * distanceKm;
    vehicleComponent = Math.max(vehicleRule.minimumFare, baseFare + distanceFare);
  }

  let hamaliFare = 0;
  if (hamaliRule && hamaliCount > 0) {
    // Same formula as the vehicle component — hamali fares are allowed to
    // have a distance component too (a rule with perKmRate=0, the current
    // admin-created default, makes this a no-op, but a future rule that
    // sets a nonzero perKmRate is honored rather than silently ignored).
    const perWorker = Math.max(
      hamaliRule.minimumFare,
      hamaliRule.baseFare + hamaliRule.perKmRate * distanceKm
    );
    hamaliFare = perWorker * hamaliCount;
  }

  // Higher of the two applicable multipliers wins when both components are
  // present — see the "surge divergence" note in the function doc comment.
  const surgeMultiplier = Math.max(
    vehicleRule?.surgeMultiplier ?? 1.0,
    hamaliRule && hamaliCount > 0 ? hamaliRule.surgeMultiplier : 1.0
  );

  const preSurgeSubtotal = vehicleComponent + hamaliFare;
  const total = preSurgeSubtotal * surgeMultiplier;

  return {
    baseFare: round2(baseFare),
    distanceFare: round2(distanceFare),
    surgeMultiplier,
    hamaliFare: round2(hamaliFare),
    total: round2(total),
  };
}
