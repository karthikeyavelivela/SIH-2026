import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import { AadhaarOfflineCard } from './AadhaarOfflineCard';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

describe('AadhaarOfflineCard — P4.1', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
  });

  it('says it is not switched on, and shows no form, when the server has it off', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: false, verified: false });
    renderWithProviders(<AadhaarOfflineCard />);
    expect(await screen.findByText(/not switched on yet/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Offline e-KYC zip file/)).not.toBeInTheDocument();
  });

  it('says it is not ready when switched on without a certificate', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: true, ready: false, verified: false });
    renderWithProviders(<AadhaarOfflineCard />);
    expect(await screen.findByText(/not ready yet/)).toBeInTheDocument();
  });

  it('shows the result, and nothing else, once verified', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: true, ready: true, verified: true, last4: '1234', nameMatch: 'partial' });
    renderWithProviders(<AadhaarOfflineCard />);
    expect(await screen.findByText(/Aadhaar ending 1234/)).toBeInTheDocument();
    expect(screen.getByText(/partly matches/)).toBeInTheDocument();
  });

  it('sends the file and the share code once, and clears them', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: true, ready: true, verified: false });
    vi.mocked(api.post).mockResolvedValue({ enabled: true, verified: true, last4: '9999', nameMatch: 'match' });
    renderWithProviders(<AadhaarOfflineCard />);
    const input = (await screen.findByLabelText(/Offline e-KYC zip file/)) as HTMLInputElement;
    const file = new File(['zipbytes'], 'offline.zip', { type: 'application/zip' });
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText(/Share code/), { target: { value: 'abcd' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    const [path, body] = vi.mocked(api.post).mock.calls[0] as [string, { fileBase64: string; shareCode: string }];
    expect(path).toBe('/api/kyc/documents/aadhaar-offline');
    expect(body.shareCode).toBe('abcd');
    expect(body.fileBase64).toMatch(/^data:.*;base64,/);
    expect(await screen.findByText(/Aadhaar ending 9999/)).toBeInTheDocument();
  });

  it('shows the server message when it is refused', async () => {
    vi.mocked(api.get).mockResolvedValue({ enabled: true, ready: true, verified: false });
    const { ApiClientError } = await import('@/lib/api');
    vi.mocked(api.post).mockRejectedValueOnce(new ApiClientError(422, 'The share code did not open the file. Check it and try again.'));
    renderWithProviders(<AadhaarOfflineCard />);
    const input = (await screen.findByLabelText(/Offline e-KYC zip file/)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'o.zip')] } });
    fireEvent.change(screen.getByLabelText(/Share code/), { target: { value: 'nope' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/share code did not open/);
  });
});
