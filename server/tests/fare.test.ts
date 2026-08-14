import { computeFareBreakdown, bucketVehicleCategory } from '../src/services/fare.service';

describe('bucketVehicleCategory', () => {
  it('maps mini_truck to vehicle_small', () => {
    expect(bucketVehicleCategory('mini_truck')).toBe('vehicle_small');
  });
  it('maps medium_truck to vehicle_medium', () => {
    expect(bucketVehicleCategory('medium_truck')).toBe('vehicle_medium');
  });
  it('maps large_truck to vehicle_large', () => {
    expect(bucketVehicleCategory('large_truck')).toBe('vehicle_large');
  });
  it('throws on an unknown vehicle type', () => {
    expect(() => bucketVehicleCategory('spaceship')).toThrow();
  });
});

describe('computeFareBreakdown', () => {
  const truckRule = {
    baseFare: 400,
    perKmRate: 28,
    minimumFare: 600,
    surgeMultiplier: 1.0,
  };
  const hamaliRule = {
    baseFare: 100,
    perKmRate: 0,
    minimumFare: 300,
    surgeMultiplier: 1.0,
  };

  it('computes a truck-only fare above the minimum', () => {
    const result = computeFareBreakdown({ vehicleRule: truckRule, distanceKm: 20 });
    expect(result.baseFare).toBe(400);
    expect(result.distanceFare).toBe(560);
    expect(result.hamaliFare).toBe(0);
    expect(result.surgeMultiplier).toBe(1.0);
    expect(result.total).toBe(960);
  });

  it('clamps to minimumFare when computed fare is below it', () => {
    const result = computeFareBreakdown({ vehicleRule: truckRule, distanceKm: 1 });
    expect(result.total).toBe(600);
  });

  it('adds a hamali component for combo bookings', () => {
    const result = computeFareBreakdown({
      vehicleRule: truckRule,
      distanceKm: 20,
      hamaliRule,
      hamaliCount: 2,
    });
    expect(result.hamaliFare).toBe(600);
    expect(result.total).toBe(960 + 600);
  });

  it('applies a surge multiplier to the whole total', () => {
    const surged = { ...truckRule, surgeMultiplier: 1.5 };
    const result = computeFareBreakdown({ vehicleRule: surged, distanceKm: 20 });
    expect(result.surgeMultiplier).toBe(1.5);
    expect(result.total).toBe(960 * 1.5);
  });

  it('computes hamali-only fare with no vehicle rule', () => {
    const result = computeFareBreakdown({ hamaliRule, hamaliCount: 3 });
    expect(result.baseFare).toBe(0);
    expect(result.distanceFare).toBe(0);
    expect(result.hamaliFare).toBe(900);
    expect(result.total).toBe(900);
  });

  it('keeps hamaliFare pre-surge in both combo and hamali-only bookings (same field, same meaning)', () => {
    const surgedHamaliRule = { ...hamaliRule, surgeMultiplier: 2.0 };
    const comboResult = computeFareBreakdown({
      vehicleRule: truckRule, // surge 1.0
      distanceKm: 20,
      hamaliRule: surgedHamaliRule, // surge 2.0
      hamaliCount: 2,
    });
    // hamaliFare must be the pre-surge per-worker amount (300*2=600), not
    // scaled by either side's surge multiplier — total is where surge shows up.
    expect(comboResult.hamaliFare).toBe(600);

    const hamaliOnlyResult = computeFareBreakdown({ hamaliRule: surgedHamaliRule, hamaliCount: 2 });
    // Same field, same booking-type-independent meaning: still pre-surge 600.
    expect(hamaliOnlyResult.hamaliFare).toBe(600);
  });

  it('applies the HIGHER of the two surge multipliers when vehicle and hamali rules diverge on a combo booking', () => {
    const surgedHamaliRule = { ...hamaliRule, surgeMultiplier: 2.0 };
    const result = computeFareBreakdown({
      vehicleRule: truckRule, // surge 1.0
      distanceKm: 20,
      hamaliRule: surgedHamaliRule, // surge 2.0 — the higher one
      hamaliCount: 2,
    });
    // vehicleComponent 960 + hamaliFare 600 = 1560 pre-surge, * 2.0 (the max) = 3120.
    expect(result.surgeMultiplier).toBe(2.0);
    expect(result.total).toBe(3120);
  });

  it('rejects a negative or non-finite distanceKm', () => {
    expect(() => computeFareBreakdown({ vehicleRule: truckRule, distanceKm: -5 })).toThrow();
    expect(() => computeFareBreakdown({ vehicleRule: truckRule, distanceKm: NaN })).toThrow();
  });

  it('rejects a negative hamaliCount', () => {
    expect(() => computeFareBreakdown({ hamaliRule, hamaliCount: -1 })).toThrow();
  });
});
