import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import { useSignupConsent } from './SignupConsent';
import { ConsentSection } from '@/components/worker/ProfileSections';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn() } };
});

function Probe() {
  const c = useSignupConsent();
  return (
    <div>
      {c.field}
      <output data-testid="valid">{String(c.valid)}</output>
      <output data-testid="payload">{JSON.stringify(c.payload)}</output>
    </div>
  );
}

describe('signup consent — P1.8', () => {
  it('is not valid until the required purposes are agreed; analytics stays off unless ticked', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByTestId('valid')).toHaveTextContent('false');
    expect(screen.getByLabelText(/I also agree to product analytics/)).not.toBeChecked();

    fireEvent.click(screen.getByLabelText(/I have read the privacy notice/));
    expect(screen.getByTestId('valid')).toHaveTextContent('true');
    const p = JSON.parse(screen.getByTestId('payload').textContent!);
    expect(p.consent.purposes).toEqual({
      identity_verification: true,
      matching_location: true,
      payments: true,
      welfare_administration: true,
      analytics: false,
    });
  });

  it('links to the privacy notice', () => {
    renderWithProviders(<Probe />);
    expect(screen.getByRole('link', { name: /Read the privacy notice/ })).toHaveAttribute('href', '/privacy');
  });
});

describe('ConsentSection — P1.8', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.put).mockReset();
  });

  it('lets someone withdraw analytics', async () => {
    vi.mocked(api.get).mockResolvedValue({ consent: { noticeVersion: 'v1', purposes: { analytics: true }, current: true, recordedAt: '2026-10-01T00:00:00Z' } });
    vi.mocked(api.put).mockResolvedValue({ consent: { noticeVersion: 'v1', purposes: { analytics: false }, current: true } });
    renderWithProviders(<ConsentSection />);
    const toggle = await screen.findByRole('switch');
    fireEvent.click(toggle);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/auth/me/consents', { purposes: { analytics: false } }));
  });

  it('asks someone who has not agreed to the current notice to do so', async () => {
    vi.mocked(api.get).mockResolvedValue({ consent: { noticeVersion: 'v1', purposes: { analytics: false }, current: false } });
    vi.mocked(api.put).mockResolvedValue({ consent: { noticeVersion: 'v1', purposes: { analytics: false }, current: true } });
    renderWithProviders(<ConsentSection />);
    fireEvent.click(await screen.findByRole('button', { name: /I agree to the four needed purposes/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/auth/me/consents', { acceptNotice: true }));
  });
});
