import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { CompletionPanel } from './CompletionPanel';

const mockPost = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { post: (...a: unknown[]) => mockPost(...a) } };
});

describe('CompletionPanel', () => {
  beforeEach(() => mockPost.mockReset());

  it('shows the code only while the work is under way', () => {
    const first = renderWithProviders(
      <CompletionPanel booking={{ _id: 'b1', status: 'in_progress' }} code="4821" onChanged={() => {}} />
    );
    expect(screen.getByText('4821')).toBeInTheDocument();
    first.unmount();
    renderWithProviders(<CompletionPanel booking={{ _id: 'b1', status: 'accepted' }} code="4821" onChanged={() => {}} />);
    expect(screen.queryByText('4821')).not.toBeInTheDocument();
  });

  it('confirms a finished job', async () => {
    const onChanged = vi.fn();
    mockPost.mockResolvedValueOnce({ booking: { _id: 'b1', status: 'completed' } });
    renderWithProviders(
      <CompletionPanel booking={{ _id: 'b1', status: 'awaiting_confirmation' }} code={null} autoConfirmHours={24} onChanged={onChanged} />
    );
    expect(screen.getByText(/after 24 hours/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm job done'));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/bookings/b1/confirm-completion'));
    expect(onChanged).toHaveBeenCalledWith({ _id: 'b1', status: 'completed' });
  });

  it('reports a problem with a real description, not an empty one', async () => {
    mockPost.mockResolvedValueOnce({ booking: { _id: 'b1', status: 'awaiting_confirmation', settlementHeld: true } });
    renderWithProviders(<CompletionPanel booking={{ _id: 'b1', status: 'awaiting_confirmation' }} code={null} onChanged={() => {}} />);
    fireEvent.click(screen.getByText('Report a problem'));
    const send = screen.getByText('Send report');
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What is wrong?'), { target: { value: 'The tap still leaks badly' } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/bookings/b1/report-problem', { description: 'The tap still leaks badly' })
    );
  });

  it('explains a held settlement instead of offering buttons', () => {
    renderWithProviders(
      <CompletionPanel booking={{ _id: 'b1', status: 'awaiting_confirmation', settlementHeld: true }} code={null} onChanged={() => {}} />
    );
    expect(screen.getByText('Problem reported')).toBeInTheDocument();
    expect(screen.queryByText('Confirm job done')).not.toBeInTheDocument();
  });
});
