import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import { RecommendedCrew } from './RecommendedCrew';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { post: vi.fn() } };
});

const rec = (source: 'ml' | 'rules') => ({
  recommendation: {
    source,
    needed: 2,
    unmet: 1,
    assigned: [{ memberId: 'm1', name: 'Ravi', reasons: ['skill_match', 'near', 'fewer_recent_days', 'made_up'], distanceKm: 1.2 }],
    alternates: [{ memberId: 'm2', name: 'Suma', reasons: ['available'], distanceKm: null }],
  },
});

describe('RecommendedCrew — P2.2', () => {
  beforeEach(() => vi.mocked(api.post).mockReset());

  it('shows names with plain-language reasons, labels the source, and hands the chosen ids back', async () => {
    vi.mocked(api.post).mockResolvedValue(rec('ml'));
    const onUse = vi.fn();
    renderWithProviders(<RecommendedCrew bookingId="b1" onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: /Suggest a crew/ }));
    expect(await screen.findByText('Ravi')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/api/mutha/allocation/recommend', { bookingId: 'b1' });
    expect(screen.getByText(/Suggested by the allocation model/)).toBeInTheDocument();
    expect(screen.getByText(/Has the skill · Close to the site · Worked fewer days lately/)).toBeInTheDocument();
    expect(screen.queryByText(/made_up/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 more needed/)).toBeInTheDocument();
    expect(screen.getByText(/Suma/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use these/ }));
    expect(onUse).toHaveBeenCalledWith(['m1']);
  });

  it('says so when it is the rules, not the model, that suggested', async () => {
    vi.mocked(api.post).mockResolvedValue(rec('rules'));
    renderWithProviders(<RecommendedCrew bookingId="b1" onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Suggest a crew/ }));
    expect(await screen.findByText(/simple rules/)).toBeInTheDocument();
  });

  it('keeps the leader in charge when the request fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('boom'));
    renderWithProviders(<RecommendedCrew bookingId="b1" onUse={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Suggest a crew/ }));
    await waitFor(() => expect(screen.getByText(/choose the crew yourself/)).toBeInTheDocument());
  });
});
