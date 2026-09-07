/**
 * Read a design token's resolved value at runtime.
 *
 * Canvas 2D, QR-code generation and a few Leaflet options need a real colour
 * string — they can't consume `var(--fy-…)`. Rather than let raw hex leak
 * back into components, those callsites read the token here so the palette
 * still has exactly one source of truth (globals.css).
 */
export function readToken(name: string, fallback = '#000000'): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
