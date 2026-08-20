const createNextIntlPlugin = require('next-intl/plugin');

// Points at the default request config path (./src/i18n/request.ts) — no
// [locale] routing segment, locale comes from the NEXT_LOCALE cookie.
const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withNextIntl(nextConfig);
