import Image from 'next/image';
import { FYRO_WORDMARK_URL, FYRO_WORDMARK_RATIO } from '@/lib/brand';

/**
 * The FYRO logotype, sized by height with the width following.
 *
 * Height, not width, because a brand bar has a height budget and the
 * wordmark has to fit it — and because giving callers a width invites the
 * square-box mistake this component exists to prevent.
 *
 * `mix-blend-mode: multiply` is doing real work here: the supplied asset
 * has a solid near-white ground rather than an alpha channel, and on the
 * bone surface that would read as a visible grey slab behind the letters.
 * Multiply keeps the black letters black and lets the ground disappear
 * into any light background. It is a workaround for the asset; a
 * transparent PNG or an SVG would make it unnecessary.
 *
 * It is a picture of a word, so the alt text IS the word — and nothing
 * should print "FYRO" beside it.
 */
export function Wordmark({ height = 22, className = '' }: { height?: number; className?: string }) {
  return (
    <Image
      src={FYRO_WORDMARK_URL}
      alt="FYRO"
      width={Math.round(height * FYRO_WORDMARK_RATIO)}
      height={height}
      priority
      className={`shrink-0 mix-blend-multiply ${className}`}
      style={{ height, width: 'auto' }}
    />
  );
}
