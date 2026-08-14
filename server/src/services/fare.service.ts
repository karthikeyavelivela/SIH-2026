export type VehicleCategory = 'vehicle_small' | 'vehicle_medium' | 'vehicle_large';

/** Same three-tier split established by the Phase 1 driver-signup vehicleType field. */
export function bucketVehicleCategory(vehicleType: string): VehicleCategory {
  if (vehicleType === 'mini_truck') return 'vehicle_small';
  if (vehicleType === 'medium_truck') return 'vehicle_medium';
  if (vehicleType === 'large_truck') return 'vehicle_large';
  throw new Error(`Unknown vehicle type: ${vehicleType}`);
}

interface RateComponent {
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
  surgeMultiplier: number;
}

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

/**
 * total = max(minimumFare, baseFare + perKmRate*distanceKm) per component,
 * summed, then the whole sum is scaled by surgeMultiplier. Phase 2 always
 * has surgeMultiplier=1.0 on every FareRule (Phase 5 computes it live) —
 * this function just reads whatever the rule says, so Phase 5 only has to
 * change what writes that field, not this read path.
 */
export function computeFareBreakdown(input: ComputeFareInput): FareBreakdown {
  const { vehicleRule, distanceKm = 0, hamaliRule, hamaliCount = 0 } = input;

  let baseFare = 0;
  let distanceFare = 0;
  let vehicleTotal = 0;
  let surgeMultiplier = 1.0;

  if (vehicleRule) {
    baseFare = vehicleRule.baseFare;
    distanceFare = vehicleRule.perKmRate * distanceKm;
    vehicleTotal = Math.max(vehicleRule.minimumFare, baseFare + distanceFare);
    surgeMultiplier = vehicleRule.surgeMultiplier;
  }

  let hamaliFare = 0;
  if (hamaliRule && hamaliCount > 0) {
    const perWorker = Math.max(hamaliRule.minimumFare, hamaliRule.baseFare + hamaliRule.perKmRate * 0);
    hamaliFare = perWorker * hamaliCount;
    // If there's no vehicle component, the hamali rule's own surge applies.
    if (!vehicleRule) surgeMultiplier = hamaliRule.surgeMultiplier;
  }

  const preSubtotal = vehicleTotal + hamaliFare;
  const total = preSubtotal * surgeMultiplier;

  return {
    baseFare,
    distanceFare,
    surgeMultiplier,
    hamaliFare: hamaliFare * (vehicleRule ? 1 : surgeMultiplier), // keep hamali-only surge reflected in the component too
    total,
  };
}
