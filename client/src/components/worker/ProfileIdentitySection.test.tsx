import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils/renderWithProviders';
import { ProfileIdentitySection } from './ProfileSections';

const mockPatch = vi.fn();
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { patch: (...args: unknown[]) => mockPatch(...args) } };
});

const mockRefetch = vi.fn();
const baseUser = {
  _id: 'user1234567890',
  name: 'Original Name',
  email: 'original@example.com',
  phone: '9000000010',
  role: 'customer',
  createdAt: '2026-01-01T00:00:00.000Z',
};
let mockUser: typeof baseUser | null = baseUser;
// Only useAuth is replaced — the rest of the module (AuthContext, which the
// shared test wrapper provides) has to keep its real exports, or every
// render through renderWithProviders fails on an undefined provider.
vi.mock('@/lib/auth-context', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth-context')>('@/lib/auth-context');
  return {
    ...actual,
    useAuth: () => ({ user: mockUser, refetch: mockRefetch, loading: false, error: null, logout: vi.fn() }),
  };
});

describe('ProfileIdentitySection — Phase 7.1, profile editing flow', () => {
  beforeEach(() => {
    mockPatch.mockReset();
    mockRefetch.mockReset();
    mockUser = baseUser;
  });

  it('renders the real name/email/phone from the authenticated user, read-only by default', () => {
    renderWithProviders(<ProfileIdentitySection />);
    expect(screen.getByText('Original Name')).toBeInTheDocument();
    expect(screen.getByText('original@example.com')).toBeInTheDocument();
    expect(screen.getByText('9000000010')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('entering edit mode reveals editable name/email fields prefilled with the current values', () => {
    renderWithProviders(<ProfileIdentitySection />);
    fireEvent.click(screen.getByText('Edit name / email'));
    const nameInput = screen.getByDisplayValue('Original Name');
    const emailInput = screen.getByDisplayValue('original@example.com');
    expect(nameInput).toBeInTheDocument();
    expect(emailInput).toBeInTheDocument();
  });

  it('saving sends exactly the edited fields to PATCH /api/auth/me/profile and refetches the session', async () => {
    mockPatch.mockResolvedValueOnce({});
    renderWithProviders(<ProfileIdentitySection />);
    fireEvent.click(screen.getByText('Edit name / email'));

    const nameInput = screen.getByDisplayValue('Original Name');
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() =>
      // `region` rides along with name and email now: it decides which
      // rate card prices this worker's jobs and which state's minimum wage
      // their rates are checked against, and it was previously settable
      // only at signup. The fixture user has none, so it posts as ''.
      expect(mockPatch).toHaveBeenCalledWith('/api/auth/me/profile', {
        name: 'Updated Name',
        email: 'original@example.com',
        region: '',
      })
    );
    await waitFor(() => expect(mockRefetch).toHaveBeenCalledTimes(1));
  });

  it('a failed save surfaces a real error and stays in edit mode rather than silently discarding the edit', async () => {
    mockPatch.mockRejectedValueOnce(new Error('server exploded'));
    renderWithProviders(<ProfileIdentitySection />);
    fireEvent.click(screen.getByText('Edit name / email'));
    fireEvent.click(screen.getByText('Save'));

    expect(await screen.findByText('Could not save.')).toBeInTheDocument();
    // Still in edit mode — the name input must still be present.
    expect(screen.getByDisplayValue('Original Name')).toBeInTheDocument();
    expect(mockRefetch).not.toHaveBeenCalled();
  });

  it('cancel discards the edit without ever calling the API', () => {
    renderWithProviders(<ProfileIdentitySection />);
    fireEvent.click(screen.getByText('Edit name / email'));
    fireEvent.change(screen.getByDisplayValue('Original Name'), { target: { value: 'Discarded Edit' } });
    fireEvent.click(screen.getByText('Cancel'));

    expect(screen.getByText('Original Name')).toBeInTheDocument();
    expect(screen.queryByText('Discarded Edit')).not.toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it('renders nothing while there is no authenticated user (never shows a form with no session)', () => {
    mockUser = null;
    const { container } = renderWithProviders(<ProfileIdentitySection />);
    expect(container).toBeEmptyDOMElement();
  });
});
