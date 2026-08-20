import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

// Supported locales for FYRO — English, Telugu (తెలుగు), Hindi (हिंदी).
// This app has no [locale] URL segment: locale is picked purely from a
// cookie (see LOCALE_COOKIE_NAME below), so every existing route
// (/customer/dashboard, /login, etc.) keeps its URL unchanged.
export const locales = ['en', 'te', 'hi'] as const;
export type AppLocale = (typeof locales)[number];
export const defaultLocale: AppLocale = 'en';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';

function isSupportedLocale(value: string | undefined): value is AppLocale {
  return !!value && (locales as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const locale = isSupportedLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
