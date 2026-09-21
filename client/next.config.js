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

module.exports = withNextIntl(nextConfig);
