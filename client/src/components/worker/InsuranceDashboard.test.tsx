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
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/insurance/me') return Promise.resolve(EMPTY_ME_RESPONSE);
      // The welfare card (P1.2) has its own request; this test is about plans.
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
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

describe('WelfareCard — P1.2, the demand-indexed welfare pool', () => {
  it('shows the district pool, the last check, and whether the worker counts as active', async () => {
    mockGet.mockReset();
    mockGet.mockImplementation((url: string) => {
      if (url === '/api/insurance/me') return Promise.resolve(EMPTY_ME_RESPONSE);
      if (url === '/api/welfare/me')
        return Promise.resolve({
          district: { id: 'd1', name: 'Vijayawada District Federation', poolBalance: 12500 },
          society: null,
          recentChecks: [{ _id: 'c1', scope: 'district', scopeName: 'Vijayawada', periodStart: '2026-09-07T00:00:00.000Z', demandIndex: 0.92, triggered: false }],
          payouts: [],
          availableDaysLast28: 3,
          rule: { triggerIndex: 0.6, payoutCapPct: 40, perMemberCap: 1000, minActiveDays: 8, minSocietyMembers: 5, historyWeeks: 12 },
        });
      return Promise.reject(new Error(`unexpected url ${url}`));
    });
    renderWithProviders(<InsuranceDashboard dashboardHref="/hamali/dashboard" />);
    expect(await screen.findByText('Vijayawada District Federation welfare pool')).toBeInTheDocument();
    expect(screen.getByText('₹12,500')).toBeInTheDocument();
    expect(screen.getByText('Last check (week of 2026-09-07): demand index 0.92')).toBeInTheDocument();
    expect(screen.getByText('Demand normal')).toBeInTheDocument();
    expect(screen.getByText('You were available on 3 of the last 28 days. Go online on at least 8 days to be counted.')).toBeInTheDocument();
    expect(screen.getByText(/One person's slow week alone never triggers it/)).toBeInTheDocument();
  });
});
