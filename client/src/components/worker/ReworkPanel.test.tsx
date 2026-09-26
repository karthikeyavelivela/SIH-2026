import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { ReworkPanel } from './ReworkPanel';
import type { Booking } from '@/lib/types';

const mockPost = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { post: (...args: unknown[]) => mockPost(...args) } };
});

const booking = {
  _id: 'b1',
  status: 'accepted',
  isRework: true,
  fareBreakdown: { baseFare: 0, distanceFare: 0, surgeMultiplier: 1, hamaliFare: 0, total: 0 },
} as unknown as Booking;

describe('ReworkPanel — P1.3 guarantee re-work', () => {
  beforeEach(() => mockPost.mockReset());

  it('explains who pays and records materials', async () => {
    mockPost.mockResolvedValue({ booking: { ...booking, materialsCost: 150 } });
    const onUpdated = vi.fn();
    renderWithProviders(<ReworkPanel booking={booking} onUpdated={onUpdated} />);
    expect(screen.getByText(/They pay only for materials you record here/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Materials cost (₹)'), { target: { value: '150' } });
    fireEvent.click(screen.getByText('Save materials'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/rework/b1/materials', { amount: 150, note: undefined }));
    expect(await screen.findByText('Saved. The customer will pay ₹150 for materials.')).toBeInTheDocument();
    expect(onUpdated).toHaveBeenCalled();
  });

  it('shows the final materials figure once the job is done', () => {
    renderWithProviders(<ReworkPanel booking={{ ...booking, status: 'completed', materialsCost: 80 } as Booking} onUpdated={() => {}} />);
    expect(screen.getByText('Materials charged to the customer: ₹80')).toBeInTheDocument();
    expect(screen.queryByText('Save materials')).not.toBeInTheDocument();
  });
});
