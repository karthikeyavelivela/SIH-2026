import type { Metadata } from 'next';
import { Syne, Outfit, Playfair_Display } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${outfit.variable} ${accentFont.variable}`}>
      <body className="font-body">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
