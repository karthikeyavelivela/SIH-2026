import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { InsuranceDashboard } from './InsuranceDashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    api: { get: (...args: unknown[]) => mockGet(...args), post: (...args: unknown[]) => mockPost(...args) },
  };
});

const EMPTY_ME_RESPONSE = { policies: [], claims: [], parametricTriggers: [], parametricTriggerHistory: [] };
const AVAILABLE_PLAN = {
  _id: 'plan1',
  name: 'Commercial Auto Basic',
  type: 'standard' as const,
  category: 'commercial_auto' as const,
  coverageAmount: 500000,
  description: 'Basic cover',
  premium: 199,
};

describe('InsuranceDashboard — Phase 7.1, insurance enrollment flow', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('shows the explore-plans action even with no active policies yet', async () => {
    mockGet.mockResolvedValueOnce(EMPTY_ME_RESPONSE);
    renderWithProviders(<InsuranceDashboard dashboardHref="/driver/dashboard" />);

    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/insurance/me'));
    expect(screen.getByText('Explore plans')).toBeInTheDocument();
  });

  it('opening the enroll modal fetches available plans', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/insurance/me') return Promise.resolve(EMPTY_ME_RESPONSE);
      if (url === '/api/insurance/plans') return Promise.resolve({ plans: [AVAILABLE_PLAN] });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    renderWithProviders(<InsuranceDashboard dashboardHref="/driver/dashboard" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/insurance/me'));

    fireEvent.click(screen.getByText('Explore plans'));
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/insurance/plans'));
    expect(await screen.findByText('Commercial Auto Basic')).toBeInTheDocument();
  });

  it('the confirm button stays disabled until consent is explicitly given', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/insurance/me') return Promise.resolve(EMPTY_ME_RESPONSE);
      if (url === '/api/insurance/plans') return Promise.resolve({ plans: [AVAILABLE_PLAN] });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    renderWithProviders(<InsuranceDashboard dashboardHref="/driver/dashboard" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/insurance/me'));

    fireEvent.click(screen.getByText('Explore plans'));
    fireEvent.click(await screen.findByText('Commercial Auto Basic'));

    expect(screen.getByText('Confirm enrolment')).toBeDisabled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('completes the real enroll POST once a plan is picked and consent is checked, then shows the confirmation', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/insurance/me') return Promise.resolve(EMPTY_ME_RESPONSE);
      if (url === '/api/insurance/plans') return Promise.resolve({ plans: [AVAILABLE_PLAN] });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    mockPost.mockResolvedValueOnce({});
    renderWithProviders(<InsuranceDashboard dashboardHref="/driver/dashboard" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/insurance/me'));

    fireEvent.click(screen.getByText('Explore plans'));
    fireEvent.click(await screen.findByText('Commercial Auto Basic'));
    fireEvent.click(screen.getByRole('checkbox'));

    const confirmButton = screen.getByText('Confirm enrolment');
    expect(confirmButton).not.toBeDisabled();
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/insurance/enroll', { planId: 'plan1', consent: true })
    );
    expect(await screen.findByText(/you're enrolled/i)).toBeInTheDocument();
  });

  it('a failed enroll POST surfaces an error and never claims a false success', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/insurance/me') return Promise.resolve(EMPTY_ME_RESPONSE);
      if (url === '/api/insurance/plans') return Promise.resolve({ plans: [AVAILABLE_PLAN] });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    mockPost.mockRejectedValueOnce(new Error('network down'));
    renderWithProviders(<InsuranceDashboard dashboardHref="/driver/dashboard" />);
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/insurance/me'));

    fireEvent.click(screen.getByText('Explore plans'));
    fireEvent.click(await screen.findByText('Commercial Auto Basic'));
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('Confirm enrolment'));

    expect(await screen.findByText('Could not enrol — try again.')).toBeInTheDocument();
    expect(screen.queryByText(/you're enrolled/i)).not.toBeInTheDocument();
  });
});
