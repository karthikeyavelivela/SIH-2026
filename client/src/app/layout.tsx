import type { Metadata } from 'next';
import { Noto_Serif, Inter, Noto_Serif_Telugu, Noto_Serif_Devanagari, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { ToastProvider } from '@/components/ui/Toast';

// The designs' serif is Noto Serif — named in the export and confirmed by
// comparing letterforms against design-reference/login.png (Fraunces is
// narrower, which made headings that wrap to two lines in the design fit on
// one). Using the same family for Telugu and Devanagari also makes the
// Indic weight-match exact rather than approximate.
const notoSerif = Noto_Serif({
  subsets: ['latin'],
  variable: '--font-serif',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700'],
});
// Weight-matched serif companions for Telugu/Hindi headings — DESIGN.md's
// "Multilingual Harmony" rule: Indic scripts share the Latin serif scale,
// not a mismatched sans fallback next to the Latin serif.
// The marketing design sets every micro-label, statutory reference and
// telemetry readout in a mono face — it is what makes the register and
// ledger surfaces read as documents rather than as app chrome.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['300', '400', '500', '600'],
});

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
      className={`${notoSerif.variable} ${inter.variable} ${jetbrainsMono.variable} ${notoSerifTelugu.variable} ${notoSerifDevanagari.variable}`}
    >
      <head>
        {/* Material Symbols Outlined — the icon system every Stitch screen
            actually uses (`<span class="material-symbols-outlined">
            icon_name</span>`). Loaded once, globally, so every rebuilt page
            can use the exact glyphs the design references instead of a
            hand-drawn approximation — see components/ui/Icon.tsx. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block"
          rel="stylesheet"
        />
      </head>
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
