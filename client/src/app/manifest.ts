import type { MetadataRoute } from 'next';
import { FYRO_LOGO_URL } from '@/lib/brand';

/**
 * The web app manifest — what makes FYRO installable.
 *
 * The problem statement asks for a "multilingual mobile application". This
 * app is a responsive web app, and an honest reading of that requirement is
 * that it should at least be installable: a home-screen icon, its own window
 * with no browser chrome, and a launch that does not go through a URL bar.
 * That is what this file buys, and it is deliberately NOT described anywhere
 * as a native build, because it is not one.
 *
 * Icons come from the same Cloudinary asset the navbar and favicon use, sized
 * by transformation, so the installed icon can never drift from the mark in
 * the app. `maskable` is declared separately from `any`: Android crops a
 * maskable icon to whatever shape the launcher uses, and the padded
 * transformation is the one that survives that crop.
 */
function icon(size: number, padded = false) {
  const transform = padded
    ? `c_pad,w_${size},h_${size},b_rgb:F7F3EC`
    : `c_fill,w_${size},h_${size}`;
  return FYRO_LOGO_URL.replace('/upload/', `/upload/${transform}/`);
}

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FYRO — Find Your Right One',
    short_name: 'FYRO',
    description:
      'Cooperative household services and goods transport. Book verified workers, track the job, and see exactly what the worker takes home.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches --fy-bone and --fy-brown in globals.css: the splash screen and
    // the Android status bar should be the app's own colours, not white.
    background_color: '#F7F3EC',
    theme_color: '#6B4423',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      { src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon(192, true), sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: icon(512, true), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
