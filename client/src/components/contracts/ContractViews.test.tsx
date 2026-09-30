import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { ContractDetail } from './ContractViews';

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: (...a: unknown[]) => mockGet(...a), post: (...a: unknown[]) => mockPost(...a) } };
});

const contract = {
  _id: 'c00000000001',
  categorySlug: 'cleaner',
  scope: 'Classroom cleaning after school.',
  kind: 'recurring',
  schedule: { startDate: '2026-10-05T00:00:00.000Z', frequency: 'weekly', daysOfWeek: [1, 4], time: '16:00', durationHours: 4 },
  workersPerVisit: 2,
  ratePerWorkerPerVisit: 400,
  status: 'countered',
  counter: { ratePerWorkerPerVisit: 450, note: 'Long shift' },
  history: [{ status: 'proposed', at: '2026-09-26T00:00:00.000Z' }],
  location: { address: 'Sri Vidya School' },
};

describe('ContractDetail — P1.6', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockGet.mockImplementation((url: string) =>
      url.includes('/statement')
        ? Promise.resolve({ month: '2026-10', lines: [], pendingVisits: 0, totals: { workerRate: 0, serviceFee: 0, total: 0, visits: 0 } })
        : Promise.resolve({ contract, visits: [] })
    );
    mockPost.mockResolvedValue({});
  });

  it('shows the counter-offer to the institution, which can accept it', async () => {
    renderWithProviders(<ContractDetail id="c00000000001" viewer="institution" />);
    expect(await screen.findByText(/Counter-offer: ₹450 per worker/)).toBeInTheDocument();
    expect(screen.getByText(/Every week on Mon, Thu/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Accept counter-offer'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/contracts/c00000000001/institution', { action: 'accept_counter' }));
  });

  it('the leader sees no institution buttons', async () => {
    renderWithProviders(<ContractDetail id="c00000000001" viewer="leader" />);
    await screen.findByText(/Counter-offer: ₹450/);
    expect(screen.queryByText('Accept counter-offer')).not.toBeInTheDocument();
  });
});
