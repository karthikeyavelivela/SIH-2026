import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { api } from '@/lib/api';
import { SchemesCard } from './SchemesCard';

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { get: vi.fn(), post: vi.fn() } };
});

const plans = [
  { code: 'pmsby', premiumAnnual: null, premiumKnown: false },
  { code: 'pmjjby', premiumAnnual: 99, premiumKnown: true, sourceUrl: 'https://example.test/c' },
];

function serve(enrolments: unknown[] = []) {
  vi.mocked(api.get).mockImplementation(async (path: string) => (path === '/api/schemes' ? { plans } : { enrolments })) as never;
}

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
});

describe('SchemesCard — P4.4', () => {
  it('says enrolment is through the bank, and never shows a premium that has not been confirmed', async () => {
    serve();
    renderWithProviders(<SchemesCard />);
    expect(await screen.findByText("Enrolment through the member's bank")).toBeInTheDocument();
    expect(screen.getAllByText(/has not been confirmed yet/)).toHaveLength(1); // PMSBY only
    expect(screen.getByText(/Yearly premium: ₹99 \(source: https:\/\/example.test\/c\)/)).toBeInTheDocument();
  });

  it('needs consent and the required details before it can be recorded', async () => {
    serve();
    vi.mocked(api.post).mockResolvedValue({ enrolment: {} });
    renderWithProviders(<SchemesCard />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Record enrolment' }))[0]);
    // The open form's button is the first; the other plan still offers its own.
    const submit = screen.getAllByRole('button', { name: 'Record enrolment' })[0];
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Bank name'), { target: { value: 'State Bank' } });
    fireEvent.change(screen.getByLabelText(/Last 4 digits/), { target: { value: '43a21' } });
    expect((screen.getByLabelText(/Last 4 digits/) as HTMLInputElement).value).toBe('4321');
    fireEvent.change(screen.getByLabelText("Nominee's name"), { target: { value: 'Sita' } });
    fireEvent.change(screen.getByLabelText("Nominee's relation"), { target: { value: 'spouse' } });
    expect(submit).toBeDisabled(); // still no consent
    fireEvent.click(screen.getByRole('checkbox'));
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/schemes/pmsby/enrol', {
        bankName: 'State Bank',
        accountLast4: '4321',
        nominee: { name: 'Sita', relation: 'spouse' },
        consent: true,
      })
    );
  });

  it('shows an enrolment waiting for the bank, and saves the bank’s reference', async () => {
    serve([{ _id: 'e1', scheme: 'pmsby', status: 'recorded' }]);
    vi.mocked(api.post).mockResolvedValue({ enrolment: {} });
    renderWithProviders(<SchemesCard />);
    expect(await screen.findByText(/Waiting for the bank's reference/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Bank's reference number"), { target: { value: 'SBI/778' } });
    fireEvent.click(screen.getByRole('button', { name: "Save the bank's reference" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/schemes/enrolments/e1/bank-confirmation', { bankReference: 'SBI/778' }));
  });

  it('shows why a renewal is on hold', async () => {
    serve([{ _id: 'e1', scheme: 'pmsby', status: 'confirmed_by_bank', bankReference: 'R1', renewalDate: '2027-01-01T00:00:00Z', renewalHold: { reason: 'pool_insufficient' } }]);
    renderWithProviders(<SchemesCard />);
    expect(await screen.findByText(/Confirmed by the bank \(R1\)/)).toBeInTheDocument();
    expect(screen.getByText('Renewal on hold: the district pool is short.')).toBeInTheDocument();
  });

  it('for a member with no phone, sends their id and words the consent as on their behalf', async () => {
    vi.mocked(api.get).mockImplementation(async (path: string) =>
      path === '/api/schemes' ? { plans } : { enrolments: [{ _id: 'x', scheme: 'pmjjby', status: 'recorded', memberId: 'someone-else' }] }
    ) as never;
    vi.mocked(api.post).mockResolvedValue({ enrolment: {} });
    renderWithProviders(<SchemesCard memberId="m1" memberName="Lakshmi" />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Record enrolment' }))[0]);
    expect(screen.getByText(/Lakshmi has agreed, and I am recording it for them/)).toBeInTheDocument();
    // an enrolment that belongs to another member is not shown on this member's card
    expect(screen.queryByText(/Waiting for the bank's reference/)).not.toBeInTheDocument();
  });
});
