'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Which of the three worlds the customer is currently in.
 *
 * FYRO is not one marketplace with a filter on it. Household is a trade
 * visiting your home, Hamali is a crew of loading workers, Transit is a
 * lorry moving goods between two places — different categories, different
 * pricing engines, different dispatch. Switching is a full context swap,
 * not a tab.
 *
 * The mode is derived from the URL rather than stored, which is what makes
 * it impossible for the screen and the mode indicator to disagree. A
 * customer who lands on /customer/book/transport from a notification is in
 * Transit, and nothing has to be told about it.
 */

export const CUSTOMER_MODES = ['household', 'labour', 'transport'] as const;
export type CustomerMode = (typeof CUSTOMER_MODES)[number];

/** Where each mode's home screen lives. */
export const MODE_HOME: Record<CustomerMode, string> = {
  household: '/customer/dashboard',
  labour: '/customer/book/labour',
  transport: '/customer/book/transport',
};

/** The glyph and accent each mode carries everywhere it appears. */
export const MODE_CHROME: Record<CustomerMode, { glyph: string; accent: 'brown' | 'green' | 'slate' }> = {
  household: { glyph: 'home_repair_service', accent: 'brown' },
  labour: { glyph: 'engineering', accent: 'green' },
  transport: { glyph: 'local_shipping', accent: 'slate' },
};

/**
 * Household is the fallback, not because it is most important but because
 * it is where /customer/dashboard lives — the screen a customer lands on
 * after signing in, and the one any unrecognised customer route belongs to.
 */
export function modeForPath(pathname: string | null): CustomerMode {
  if (!pathname) return 'household';
  if (pathname.startsWith('/customer/book/transport')) return 'transport';
  if (pathname.startsWith('/customer/book/labour')) return 'labour';
  return 'household';
}

export function useCustomerMode() {
  const pathname = usePathname();
  const router = useRouter();
  const mode = modeForPath(pathname);

  const setMode = useCallback(
    (next: CustomerMode) => {
      if (next === mode) return;
      router.push(MODE_HOME[next]);
    },
    [mode, router]
  );

  return { mode, setMode };
}
