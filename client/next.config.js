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

/*
 * Security headers on every page.
 *
 * The CSP lists exactly the origins the app loads from: Cloudinary (images,
 * the hero video), OpenStreetMap tiles, Google Fonts (Material Symbols),
 * Razorpay Checkout (its script, frames and API), and the API origin for
 * the realtime socket. 'unsafe-inline' stays on script-src because Next.js
 * 14 inlines its bootstrap scripts without a nonce; 'unsafe-eval' only in
 * development, where React Refresh needs it.
 */
const isDev = process.env.NODE_ENV !== 'production';
const SOCKET_ORIGIN = process.env.NEXT_PUBLIC_SOCKET_URL || API_ORIGIN;
// Preview deployments call the API directly rather than through the rewrite.
const API_BASE_ORIGIN = process.env.NEXT_PUBLIC_API_BASE || API_ORIGIN;
const wsOrigin = SOCKET_ORIGIN.replace(/^http/, 'ws');
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org https://*.razorpay.com",
  "media-src 'self' https://res.cloudinary.com",
  `connect-src 'self' ${API_BASE_ORIGIN} ${SOCKET_ORIGIN} ${wsOrigin} https://*.razorpay.com${isDev ? ' ws://localhost:* http://localhost:*' : ''}`,
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

nextConfig.headers = async () => [
  {
    source: '/:path*',
    headers: [
      { key: 'Content-Security-Policy', value: csp },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      // Location for the area chip and booking pickup, camera for Scan and
      // Diagnose and proof photos, microphone for voice input. Nothing else.
      { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(self), payment=(self "https://checkout.razorpay.com"), usb=(), serial=()' },
    ],
  },
];

module.exports = withNextIntl(nextConfig);
