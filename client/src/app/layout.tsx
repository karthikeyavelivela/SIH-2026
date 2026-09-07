import type { Metadata } from 'next';
import { Fraunces, Inter, Noto_Serif_Telugu, Noto_Serif_Devanagari } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ToastProvider } from '@/components/ui/Toast';

// v3 type system (DESIGN_MAP.md / stitch DESIGN.md): Fraunces carries every
// headline, display number, and metric readout; Inter carries body/UI/table
// numerals. Fraunces is a real variable font with a genuine italic — used
// for the rare accent-italic role too, so we don't carry a third serif
// family just for one word in the marketing hero. Syne/Outfit/Playfair are
// gone entirely, not just unused — every screen now renders through these.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  // Loaded as the actual variable font (not a fixed-weight subset) so
  // every weight from 300-900 is real, including the font-extrabold hero
  // numbers and font-bold headlines existing components already use — no
  // browser-synthesized bold on a thin cut.
  weight: 'variable',
  style: ['normal', 'italic'],
  axes: ['opsz', 'SOFT', 'WONK'],
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});
// Weight-matched serif companions for Telugu/Hindi headings — DESIGN.md's
// "Multilingual Harmony" rule: Indic scripts share the Latin serif scale,
// not a mismatched sans fallback next to Fraunces.
const notoSerifTelugu = Noto_Serif_Telugu({
  subsets: ['telugu'],
  variable: '--font-noto-serif-telugu',
  weight: ['400', '500', '600'],
});
const notoSerifDevanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-noto-serif-devanagari',
  weight: ['400', '500', '600'],
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
    <html
      lang={locale}
      className={`${fraunces.variable} ${inter.variable} ${notoSerifTelugu.variable} ${notoSerifDevanagari.variable}`}
    >
      <body className="font-body">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
            <OfflineBanner />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
