import type { Metadata, Viewport } from 'next';
import { FYRO_LOGO_URL } from '@/lib/brand';
import { Noto_Serif, Inter, Noto_Serif_Telugu, Noto_Serif_Devanagari, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { GlobalSearch } from '@/components/ui/GlobalSearch';
import { PwaProvider } from '@/components/ui/PwaProvider';
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
  // Not preloaded: mono is used for micro-labels and ledger readouts, none of
  // which are the first thing on screen. next/font still self-hosts it — this
  // only stops it competing with the body text for the first connections.
  preload: false,
});

// The Indic faces are large and are needed by exactly the readers whose
// locale selects them. Preloading all three scripts for every visitor cost
// every English user two font downloads they would never render — which is
// the kind of thing that makes a mid-range Android phone feel slow on first
// paint. They are still self-hosted and still applied by CSS variable; they
// are simply fetched when the page that needs them asks for them.
const notoSerifTelugu = Noto_Serif_Telugu({
  subsets: ['telugu'],
  variable: '--font-noto-serif-telugu',
  weight: ['400', '500', '600'],
  preload: false,
});
const notoSerifDevanagari = Noto_Serif_Devanagari({
  subsets: ['devanagari'],
  variable: '--font-noto-serif-devanagari',
  weight: ['400', '500', '600'],
  preload: false,
});

// Android tints the status bar with this, and it is the same brown the
// manifest declares — an installed FYRO should not open with a white bar
// above the app's own colour.
export const viewport: Viewport = {
  themeColor: '#6B4423',
  // The app has its own bottom bars and fixed controls; letting the browser
  // zoom the layout on a double-tap makes those jump. Text zoom still works.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'FYRO — Find Your Right One',
  description: 'Book trucks and Hamali labor across Andhra Pradesh, on demand.',
  icons: {
    icon: [{ url: FYRO_LOGO_URL }],
    shortcut: [{ url: FYRO_LOGO_URL }],
    apple: [{ url: FYRO_LOGO_URL }],
  },
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
        {/* The icon stylesheet below is render-blocking and lives on another
            origin, so the TCP and TLS handshakes are worth starting before
            the parser reaches it. Two origins: the stylesheet and the font
            file it references. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Material Symbols Outlined — the icon system every Stitch screen
            actually uses (`<span class="material-symbols-outlined">
            icon_name</span>`). Loaded once, globally, so every rebuilt page
            can use the exact glyphs the design references instead of a
            hand-drawn approximation — see components/ui/Icon.tsx.

            Only two of the four axes are requested as ranges. Icon.tsx varies
            FILL (0 or 1) and opsz (with the rendered size) and pins wght to
            400 and GRAD to 0, so asking for the full 100..700 weight and
            -50..200 grade ranges was downloading a much larger variable font
            to render exactly one weight of it. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,400,0..1,0&display=block"
          rel="stylesheet"
        />
      </head>
      <body className="font-body">
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ToastProvider>
            <AuthProvider>
              {children}
              {/* Mounted once, globally: search is reachable from every
                  screen and renders nothing at all when signed out. */}
              <GlobalSearch />
              <PwaProvider />
            </AuthProvider>
            <OfflineBanner />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
