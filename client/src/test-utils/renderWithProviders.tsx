import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import enMessages from '@/i18n/messages/en.json';

// Real production copy (en.json), not a per-test stub — a test that
// renders "newJobTitle" as literal text would silently keep passing after
// that key is renamed/removed from en.json; rendering through the actual
// messages file means a broken translation key fails the test the same way
// it would break the real app.
export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
    options
  );
}

export * from '@testing-library/react';
