'use server';

import { cookies } from 'next/headers';
import { locales, LOCALE_COOKIE_NAME, type AppLocale } from './request';

// Server Action used by the LanguagePill switcher (see its usage in
// client/src/app/(marketing)/page.tsx). Sets the NEXT_LOCALE cookie that
// src/i18n/request.ts reads on every subsequent request. The caller must
// follow this with router.refresh() (or a navigation) so Server Components
// re-render with the new locale — this action only persists the cookie.
export async function setLocaleAction(locale: AppLocale): Promise<void> {
  if (!(locales as readonly string[]).includes(locale)) return;
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}
