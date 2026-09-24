import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { AuthContext, type AuthUser } from '@/lib/auth-context';
import { useRoleGuard } from '@/lib/useRoleGuard';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

function Probe({ allowed }: { allowed: string[] }) {
  useRoleGuard(allowed);
  return null;
}

function mount(value: { user: Partial<AuthUser> | null; loading?: boolean; error?: string | null }, allowed = ['customer']) {
  render(
    <AuthContext.Provider
      value={{
        user: value.user as AuthUser | null,
        loading: value.loading ?? false,
        error: value.error ?? null,
        refetch: async () => null,
        logout: async () => {},
      }}
    >
      <Probe allowed={allowed} />
    </AuthContext.Provider>
  );
}

/*
 * The sign-in loop came from one rule shared by every role layout: "no user
 * OR the wrong role goes to /login". These pin the three cases apart.
 */
describe('useRoleGuard', () => {
  beforeEach(() => replace.mockReset());

  it('sends a signed-out visitor to sign in', () => {
    mount({ user: null });
    expect(replace).toHaveBeenCalledWith('/login');
  });

  it('sends a signed-in person in the wrong area to their OWN home, never to sign in', () => {
    mount({ user: { role: 'admin' } });
    expect(replace).toHaveBeenCalledWith('/admin/dashboard');
    expect(replace).not.toHaveBeenCalledWith('/login');
  });

  it('does not treat a failed session check as signed out', () => {
    mount({ user: null, error: 'HTTP 504' });
    expect(replace).not.toHaveBeenCalled();
  });

  it('waits while the session is still being checked', () => {
    mount({ user: null, loading: true });
    expect(replace).not.toHaveBeenCalled();
  });

  it('leaves a permitted user alone', () => {
    mount({ user: { role: 'manager' } }, ['admin', 'manager']);
    expect(replace).not.toHaveBeenCalled();
  });
});
