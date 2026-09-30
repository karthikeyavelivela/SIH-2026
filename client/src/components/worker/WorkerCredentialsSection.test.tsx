import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import { EShramCard, PoliceVerificationCard } from './WorkerCredentialsSection';
import { PoliceReviewQueue } from '@/components/kyc/PoliceReviewQueue';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() } };
});

beforeEach(() => {
  for (const f of Object.values(api)) (f as ReturnType<typeof vi.fn>).mockReset();
});

describe('EShramCard — P4.4', () => {
  it('says it does not check the number against the portal, and sends only 12 digits', async () => {
    vi.mocked(api.get).mockResolvedValue({ registered: false, hasCard: false });
    vi.mocked(api.put).mockResolvedValue({ registered: true, uanMasked: '••••••••9012', hasCard: false });
    renderWithProviders(<EShramCard />);
    expect(await screen.findByText(/does not check it against the e-Shram portal/)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save number' });
    const input = screen.getByLabelText('12-digit number');
    fireEvent.change(input, { target: { value: '12ab34' } });
    expect((input as HTMLInputElement).value).toBe('1234');
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '123456789012' } });
    fireEvent.click(save);
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/eshram', { uan: '123456789012' }));
    expect(await screen.findByText(/Recorded: ••••••••9012/)).toBeInTheDocument();
    expect(screen.getByText(/Add a photo of the card/)).toBeInTheDocument();
  });
});

describe('PoliceVerificationCard — P4.4', () => {
  it('shows the badge and days left while valid, and hides the form only while one is pending', async () => {
    vi.mocked(api.get).mockResolvedValue({ verifications: [{ _id: 'a', status: 'verified', validNow: true, expired: false, daysLeft: 120, expiresAt: '2027-01-31T00:00:00Z' }] });
    renderWithProviders(<PoliceVerificationCard />);
    expect(await screen.findByText(/Police verified until .* \(120 days left\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for checking' })).toBeInTheDocument();
  });

  it('says a pending one is waiting, and offers no second submission', async () => {
    vi.mocked(api.get).mockResolvedValue({ verifications: [{ _id: 'a', status: 'pending', validNow: false, expired: false }] });
    renderWithProviders(<PoliceVerificationCard />);
    expect(await screen.findByText('Waiting to be reviewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send for checking' })).not.toBeInTheDocument();
  });

  it('shows why one was rejected, and an expired one', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ verifications: [{ _id: 'a', status: 'rejected', validNow: false, expired: false, rejectionReason: 'The photo is cut off' }] });
    const { unmount } = renderWithProviders(<PoliceVerificationCard />);
    expect(await screen.findByText(/Not approved: The photo is cut off/)).toBeInTheDocument();
    unmount();
    vi.mocked(api.get).mockResolvedValueOnce({ verifications: [{ _id: 'b', status: 'verified', validNow: false, expired: true }] });
    renderWithProviders(<PoliceVerificationCard />);
    expect(await screen.findByText(/Expired. Please upload a new one/)).toBeInTheDocument();
  });

  it('sends the reference number', async () => {
    vi.mocked(api.get).mockResolvedValue({ verifications: [] });
    vi.mocked(api.post).mockResolvedValue({ verification: {} });
    renderWithProviders(<PoliceVerificationCard />);
    fireEvent.change(await screen.findByLabelText(/Reference number/), { target: { value: 'PCC/2026/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for checking' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/police-verification', { referenceNumber: 'PCC/2026/1' }));
  });
});

describe('PoliceReviewQueue — P4.4', () => {
  const row = { _id: 'r1', workerName: 'Lakshmi', referenceNumber: 'PCC/9', hasFile: true, createdAt: '2026-10-01T00:00:00Z' };

  it('approves in one tap', async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ queue: [row] }).mockResolvedValueOnce({ queue: [] });
    vi.mocked(api.patch).mockResolvedValue({});
    renderWithProviders(<PoliceReviewQueue />);
    expect(await screen.findByText('Lakshmi')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Approve for 12 months' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/police-verification/r1', { decision: 'verified' }));
    expect(await screen.findByText('Nothing waiting to be checked.')).toBeInTheDocument();
  });

  it('will not reject without a reason', async () => {
    vi.mocked(api.get).mockResolvedValue({ queue: [row] });
    vi.mocked(api.patch).mockResolvedValue({});
    renderWithProviders(<PoliceReviewQueue />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const confirm = screen.getByRole('button', { name: 'Reject' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Why is it not approved?'), { target: { value: 'Blurry' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/api/police-verification/r1', { decision: 'rejected', reason: 'Blurry' }));
  });
});
