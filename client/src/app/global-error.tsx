'use client';

// Last-resort boundary for errors in the ROOT layout itself (font loading,
// NextIntlClientProvider setup, AuthProvider mount) — Next.js requires this
// file to render its own <html>/<body>, which means it runs OUTSIDE the
// root layout and therefore has no NextIntlClientProvider to read a locale
// from. English-only here is a deliberate, honest scope limit: this path
// only fires when the app's own bootstrapping breaks, which every major
// app (including ones with full i18n) falls back to a single language for.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', background: '#fff', color: '#111' }}>
        <div style={{ maxWidth: 420, margin: '80px auto', padding: '0 24px', textAlign: 'center' }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>FYRO hit a problem loading</h1>
          <p style={{ fontSize: 14, color: '#555', marginBottom: 20 }}>
            Something went wrong while starting the app. Try again, or reload the page.
          </p>
          <button
            onClick={reset}
            style={{
              background: '#EA580C',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
