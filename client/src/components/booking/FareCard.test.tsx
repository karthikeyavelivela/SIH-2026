import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { bucketVehicleCategory, FareCard } from './FareCard';

describe('bucketVehicleCategory — Phase 7.1, booking creation pricing logic', () => {
  it('mirrors the server\'s three-tier thresholds exactly (fare.service.ts\'s bucketVehicleCategoryFromCapacity)', () => {
    expect(bucketVehicleCategory(500)).toBe('vehicle_small');
    expect(bucketVehicleCategory(1000)).toBe('vehicle_small'); // boundary, inclusive
    expect(bucketVehicleCategory(1001)).toBe('vehicle_medium');
    expect(bucketVehicleCategory(5000)).toBe('vehicle_medium'); // boundary, inclusive
    expect(bucketVehicleCategory(5001)).toBe('vehicle_large');
  });
});

describe('FareCard — Phase 7.1, booking creation flow', () => {
  it('idle state prompts the customer to fill in pickup/drop/load before showing a fare', () => {
    renderWithProviders(<FareCard state="idle" fare={null} errorMessage={null} />);
    expect(screen.getByText('Add pickup, drop, and load details to see your fare.')).toBeInTheDocument();
  });

  it('ready state renders the real server-computed fare breakdown, never a client-invented number', () => {
    renderWithProviders(
      <FareCard
        state="ready"
        fare={{ baseFare: 150, distanceFare: 200.36, surgeMultiplier: 1, hamaliFare: 0, total: 350.36 }}
        errorMessage={null}
      />
    );
    expect(screen.getByText('₹150')).toBeInTheDocument();
    expect(screen.getByText('₹200.36')).toBeInTheDocument();
    expect(screen.getByText('₹350.36')).toBeInTheDocument();
    // surgeMultiplier of exactly 1 must never render a surge line — that
    // would falsely suggest a surge charge was applied when none was.
    expect(screen.queryByText('Surge')).not.toBeInTheDocument();
  });

  it('a real surge multiplier > 1 shows the surge line', () => {
    renderWithProviders(
      <FareCard
        state="ready"
        fare={{ baseFare: 150, distanceFare: 200, surgeMultiplier: 1.5, hamaliFare: 0, total: 525 }}
        errorMessage={null}
      />
    );
    expect(screen.getByText('Surge')).toBeInTheDocument();
    expect(screen.getByText('×1.5')).toBeInTheDocument();
  });

  it('a hamali-inclusive fare shows the labor line item', () => {
    renderWithProviders(
      <FareCard
        state="ready"
        fare={{ baseFare: 100, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 300, total: 400 }}
        errorMessage={null}
      />
    );
    expect(screen.getByText('Hamali labor')).toBeInTheDocument();
    expect(screen.getByText('₹300')).toBeInTheDocument();
  });

  it('error state shows the real server error message, not a generic fallback, when one is provided', () => {
    renderWithProviders(<FareCard state="error" fare={null} errorMessage="No active fare rule for this region" />);
    expect(screen.getByText('No active fare rule for this region')).toBeInTheDocument();
  });

  it('error state falls back to a generic message when the server gave none', () => {
    renderWithProviders(<FareCard state="error" fare={null} errorMessage={null} />);
    expect(screen.getByText('Could not estimate a fare for this trip.')).toBeInTheDocument();
  });
});
