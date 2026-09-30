import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import ClaimAccountPage from './page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }) }));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { post: vi.fn() } };
});

describe('ClaimAccountPage — P1.7', () => {
  beforeEach(() => vi.mocked(api.post).mockReset());

  it('walks code + phone, then OTP + password, then points at sign in', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ devOtp: '123456' }).mockResolvedValueOnce({ ok: true });
    renderWithProviders(<ClaimAccountPage />);

    fireEvent.change(screen.getByLabelText(/Claim code/i), { target: { value: 'abc123' } });
    fireEvent.change(screen.getByLabelText(/Your mobile number/i), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/i }));

    await waitFor(() => expect(screen.getByLabelText(/^OTP$/i)).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith('/api/proxy-claim/start', { code: 'ABC123', phone: '9876543210' });
    expect(screen.getByText(/123456/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^OTP$/i), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/Choose a password/i), { target: { value: 'secret-pass-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Claim my account/i }));

    await waitFor(() => expect(screen.getByRole('link', { name: /Go to sign in/i })).toBeInTheDocument());
    expect(api.post).toHaveBeenLastCalledWith('/api/proxy-claim/complete', {
      code: 'ABC123',
      phone: '9876543210',
      otp: '123456',
      password: 'secret-pass-1',
    });
  });

  it('shows the server message when the code is wrong', async () => {
    const { ApiClientError } = await import('@/lib/api');
    vi.mocked(api.post).mockRejectedValueOnce(new ApiClientError(400, 'Invalid or expired claim code'));
    renderWithProviders(<ClaimAccountPage />);
    fireEvent.change(screen.getByLabelText(/Claim code/i), { target: { value: 'BAD000' } });
    fireEvent.change(screen.getByLabelText(/Your mobile number/i), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: /Send OTP/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired claim code');
  });
});
