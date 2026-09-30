import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { DisputeQueueView } from './DisputeQueueView';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
const mockGet = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: (...args: unknown[]) => mockGet(...args) } };
});

describe('DisputeQueueView — P1.5', () => {
  beforeEach(() => {
    mockGet.mockReset();
    push.mockReset();
  });

  it('lists waiting disputes with the time left, and switches to resolved', async () => {
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({
        disputes: url.includes('resolved')
          ? []
          : [
              {
                _id: 'abcdef123456',
                claim: 'Work left unfinished',
                status: 'open',
                priority: 'high',
                createdAt: new Date().toISOString(),
                raisedBy: { name: 'Demo Customer' },
                level: 'society',
                slaDueAt: new Date(Date.now() + 30 * 3600_000).toISOString(),
              },
            ],
      })
    );
    renderWithProviders(<DisputeQueueView detailHref={(id) => `/mutha/disputes/${id}`} />);
    expect(await screen.findByText('Work left unfinished')).toBeInTheDocument();
    expect(screen.getByText(/30 h left/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Resolved here'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/dispute-queue?status=resolved'));
    expect(await screen.findByText('Nothing waiting')).toBeInTheDocument();
  });
});
