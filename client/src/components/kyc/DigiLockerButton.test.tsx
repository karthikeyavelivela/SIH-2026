import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import { DigiLockerButton } from './DigiLockerButton';
import DigiLockerCallbackPage from '@/app/digilocker/callback/page';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  search = '';
});

describe('DigiLockerButton — P4.4', () => {
  it('says it is not switched on, with no button, when the server has it off', async () => {
    vi.mocked(api.get).mockResolvedValue({ ready: false });
    renderWithProviders(<DigiLockerButton docType="pan" />);
    expect(await screen.findByText(/not switched on yet. Please upload the document/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('starts the sign-in and sends the person to the address the server gave', async () => {
    vi.mocked(api.get).mockResolvedValue({ ready: true });
    vi.mocked(api.post).mockResolvedValue({ authorizeUrl: 'https://api.digitallocker.gov.in/public/oauth2/1/authorize?x=1' });
    const assign = vi.fn();
    Object.defineProperty(window, 'location', { value: { assign }, writable: true });
    renderWithProviders(<DigiLockerButton docType="driving_licence" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch from DigiLocker' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/digilocker/start', { docType: 'driving_licence' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://api.digitallocker.gov.in/public/oauth2/1/authorize?x=1'));
  });

  it('shows the server message if it cannot start', async () => {
    vi.mocked(api.get).mockResolvedValue({ ready: true });
    const { ApiClientError } = await import('@/lib/api');
    vi.mocked(api.post).mockRejectedValueOnce(new ApiClientError(503, 'Fetching from DigiLocker is not switched on yet.'));
    renderWithProviders(<DigiLockerButton docType="pan" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Fetch from DigiLocker' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/not switched on yet/);
  });
});

describe('DigiLocker callback page — P4.4', () => {
  it('hands the code and state to the server exactly once and reports success', async () => {
    search = 'code=abc&state=xyz';
    vi.mocked(api.post).mockResolvedValue({ document: {} });
    renderWithProviders(<DigiLockerCallbackPage />);
    expect(await screen.findByText(/Your document was fetched and is waiting to be checked/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/api/digilocker/complete', { state: 'xyz', code: 'abc', error: undefined });
  });

  it('passes on a refusal from DigiLocker and shows the server’s message', async () => {
    search = 'state=xyz&error=access_denied';
    const { ApiClientError } = await import('@/lib/api');
    vi.mocked(api.post).mockRejectedValueOnce(new ApiClientError(400, 'DigiLocker was not authorised, so nothing was fetched.'));
    renderWithProviders(<DigiLockerCallbackPage />);
    expect(await screen.findByText('DigiLocker was not authorised, so nothing was fetched.')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/api/digilocker/complete', { state: 'xyz', code: undefined, error: 'access_denied' });
  });

  it('with no state at all, does not call the server and says it failed', async () => {
    search = '';
    renderWithProviders(<DigiLockerCallbackPage />);
    expect(await screen.findByText(/You can upload the document instead/)).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
});
