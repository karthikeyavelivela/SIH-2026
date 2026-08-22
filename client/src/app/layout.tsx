import type { Metadata } from 'next';
import { Syne, Outfit, Playfair_Display } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

const syne = Syne({ subsets: ['latin'], variable: '--font-syne', weight: ['600', '700', '800'] });
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', weight: ['400', '500', '600'] });
// Editorial italic accent — used sparingly (one word in the marketing hero),
// never for body/UI text. Syne has no real italic face; this is a proper
// one instead of a synthetic/faux-italic skew.
const accentFont = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-accent',
  weight: ['600'],
  style: ['italic'],
});

export const metadata: Metadata = {
  title: 'FYRO — Find Your Right One',
  description: 'Book trucks and Hamali labor across Andhra Pradesh, on demand.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale is read server-side from the NEXT_LOCALE cookie (see
  // src/i18n/request.ts), falling back to 'en'. No [locale] URL segment —
  // existing routes are unaffected.
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${syne.variable} ${outfit.variable} ${accentFont.variable}`}>
      <body className="font-body">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <AuthProvider>{children}</AuthProvider>
          <OfflineBanner />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
