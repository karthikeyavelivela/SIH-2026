import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import ForgotPasswordPage from './page';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

describe('forgot password — P4.3', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('when no code can reach a phone, it says so and shows no form', async () => {
    vi.mocked(api.get).mockResolvedValue({ available: false });
    renderWithProviders(<ForgotPasswordPage />);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/auth/forgot-password/status'));
    expect(screen.queryByLabelText(/Mobile number/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in|back/i })).toBeInTheDocument();
  });

  it('when it can, walks phone, then code and new password, then says it is done', async () => {
    vi.mocked(api.get).mockResolvedValue({ available: true });
    vi.mocked(api.post).mockResolvedValueOnce({ ok: true, devOtp: '123456' }).mockResolvedValueOnce({ ok: true });
    renderWithProviders(<ForgotPasswordPage />);
    fireEvent.change(await screen.findByLabelText(/Mobile number/), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText(/Test mode: your code is 123456/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/api/auth/forgot-password/start', { phone: '9876543210' });

    fireEvent.change(screen.getByLabelText(/^Code$/), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'NewPassw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByText(/Your password is changed/)).toBeInTheDocument();
    expect(api.post).toHaveBeenLastCalledWith('/api/auth/forgot-password/complete', { phone: '9876543210', otp: '123456', newPassword: 'NewPassw0rd!' });
  });

  it('shows the server message when the code is refused', async () => {
    vi.mocked(api.get).mockResolvedValue({ available: true });
    const { ApiClientError } = await import('@/lib/api');
    vi.mocked(api.post).mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new ApiClientError(400, 'That code is not right, or it has expired. Ask for a new one.'));
    renderWithProviders(<ForgotPasswordPage />);
    fireEvent.change(await screen.findByLabelText(/Mobile number/), { target: { value: '9876543210' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }));
    fireEvent.change(await screen.findByLabelText(/^Code$/), { target: { value: '000000' } });
    fireEvent.change(screen.getByLabelText(/New password/), { target: { value: 'NewPassw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not right, or it has expired/);
  });
});
