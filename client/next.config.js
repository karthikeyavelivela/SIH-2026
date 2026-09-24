const createNextIntlPlugin = require('next-intl/plugin');

// Points at the default request config path (./src/i18n/request.ts) — no
// [locale] routing segment, locale comes from the NEXT_LOCALE cookie.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /*
   * Remote images have to be allow-listed, or next/image refuses them.
   *
   * Without this block every <Image src="https://res.cloudinary.com/...">
   * came back from /_next/image as a 400 INVALID_IMAGE_OPTIMIZE_REQUEST,
   * which renders as a broken-image icon. The FYRO wordmark on the login
   * screen was exactly that, live. Plain <img> callers elsewhere were
   * unaffected, which is why it went unnoticed: they bypass the optimiser
   * entirely.
   *
   * Worth having rather than switching every caller to <img>: the
   * optimiser is what serves a 2144px wordmark as a 128px WebP, and this
   * app is already slow enough over the network without shipping full-size
   * PNGs to a phone.
   */
  images: {
    remotePatterns: [
      // Every photograph, category render and brand mark in the app.
      { protocol: 'https', hostname: 'res.cloudinary.com', pathname: '/**' },
    ],
  },
};

/*
 * The API is served from this origin, and forwarded to Render from here.
 *
 * WHY: the session cookie used to be set by sih-2026-f63s.onrender.com
 * while every page lived on fyro.vercel.app. Those are different sites
 * (both vercel.app and onrender.com are on the Public Suffix List), so to
 * the browser the session was a THIRD-PARTY cookie. WebKit blocks those
 * outright — which is every browser on an iPhone, and every home-screen
 * PWA there — and Brave, Samsung Internet and strict Firefox do too. On
 * those devices login returned 200, the cookie was silently dropped, the
 * next /api/auth/me came back 401, and the person landed on the sign-in
 * page again with the right password. Proxied through this origin the
 * cookie is first-party, and nothing blocks it.
 *
 * Only the socket still talks to Render directly (a rewrite cannot carry a
 * WebSocket); it authenticates with a short-lived token instead of the
 * cookie — see lib/socket.ts.
 */
const API_ORIGIN = process.env.API_PROXY_TARGET || 'https://sih-2026-f63s.onrender.com';

nextConfig.rewrites = async () => [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];

module.exports = withNextIntl(nextConfig);
