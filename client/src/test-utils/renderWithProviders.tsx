import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/i18n/messages/en.json';
import { AuthContext, type AuthUser } from '@/lib/auth-context';

// Real production copy (en.json), not a per-test stub — a test that
// renders "newJobTitle" as literal text would silently keep passing after
// that key is renamed/removed from en.json; rendering through the actual
// messages file means a broken translation key fails the test the same way
// it would break the real app.
// Components reach for the signed-in user through useAuth, which throws
// outside a provider. Standing up the real AuthProvider here would make
// every test hit /api/auth/me, so the context value is supplied directly;
// pass `user` for a test that depends on who is signed in.
const SIGNED_IN: AuthUser = {
  _id: 'test-user',
  name: 'Test User',
  phone: '9000000000',
  role: 'hamali_solo',
  roles: ['hamali_solo'],
} as AuthUser;

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'> & { user?: AuthUser | null }
) {
  const { user = SIGNED_IN, ...renderOptions } = options ?? {};
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AuthContext.Provider
        value={{ user, loading: false, error: null, refetch: async () => {}, logout: async () => {} }}
      >
        {ui}
      </AuthContext.Provider>
    </NextIntlClientProvider>,
    renderOptions
  );
}

export * from '@testing-library/react';
