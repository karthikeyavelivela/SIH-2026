import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { StatutoryFloorNote, type StatutoryFloor } from './StatutoryFloorNote';

// Test fixture only — the same shape the server sends; not a statutory figure.
const floor: StatutoryFloor = {
  state: 'Andhra Pradesh',
  zone: 'zone_1',
  skillBand: 'skilled',
  monthlyRate: 13407,
  dailyRate: 515.65,
  hourlyRate: 64.46,
  workingDaysPerMonth: 26,
  workingHoursPerDay: 8,
  notificationNumber: 'G/3186486/2026',
  scheduledEmployment: 'Shops and Commercial Establishments',
  sourceType: 'secondary_compilation',
  notificationDate: '2026-03-23T00:00:00.000Z',
  sourceUrl: 'https://example.invalid/compilation',
};

describe('StatutoryFloorNote', () => {
  it('cites the notification with its date and links the source', () => {
    renderWithProviders(<StatutoryFloorNote floor={floor} />);
    expect(screen.getByText(/Notification G\/3186486\/2026, dated 23 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText('Where this figure comes from').closest('a')).toHaveAttribute('href', 'https://example.invalid/compilation');
    expect(screen.queryByText(/update pending/)).not.toBeInTheDocument();
  });

  it('says plainly when the notification has lapsed', () => {
    renderWithProviders(<StatutoryFloorNote floor={{ ...floor, stale: true }} />);
    expect(screen.getByText('Last notified rate — update pending')).toBeInTheDocument();
  });
});
