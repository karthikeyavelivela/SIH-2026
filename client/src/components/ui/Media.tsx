import { assetUrl, MEDIA_MANIFEST } from '@/lib/MEDIA_MANIFEST';

type Treatment = 'full-bleed' | 'duotone' | 'circular' | 'inline';
type Tint = 'household' | 'labour' | 'transport';

interface MediaProps {
  id: string;
  kind?: 'photo' | 'render';
  aspect?: number;
  /**
   * Set when the caller already fixes the box (PhotoCard's h-44 / h-[480px]
   * slots). Without it the intrinsic aspect ratio fights the height class and
   * the placeholder renders at the wrong size inside its own card.
   */
  fill?: boolean;
  treatment?: Treatment;
  tint?: Tint;
  alt: string;
  className?: string;
}

const TINT_BG: Record<Tint, string> = {
  household: 'bg-fy-brown/14',
  labour: 'bg-fy-lime/22',
  transport: 'bg-fy-slate/14',
};
const TINT_TEXT: Record<Tint, string> = {
  household: 'text-fy-brown',
  labour: 'text-fy-ink',
  transport: 'text-fy-slate',
};

const treatmentShape: Record<Treatment, string> = {
  'full-bleed': 'rounded-none',
  duotone: 'rounded-card',
  circular: 'rounded-full',
  inline: 'rounded-cell',
};

/**
 * The single image slot for the whole product (Phase 0.4). Looks up a
 * real asset first (see MEDIA_MANIFEST's `assetUrl`) — when one exists,
 * renders a plain `<img>`. Until then, renders a designed placeholder at
 * the exact final aspect/crop: a tinted panel, the fyro-grain texture, and
 * the asset id printed on it (so it's obviously a placeholder in review,
 * never mistaken for a broken image or a decision already made). Swapping
 * in real assets later means editing MEDIA_MANIFEST.ts only — this
 * component and every page that calls it stay untouched.
 */
export function Media({ id, kind, aspect, fill = false, treatment = 'duotone', tint = 'household', alt, className = '' }: MediaProps) {
  const manifestEntry = MEDIA_MANIFEST[id];
  const resolvedAspect = aspect ?? manifestEntry?.aspect ?? 1;
  const resolvedKind = kind ?? manifestEntry?.kind ?? 'photo';
  const real = assetUrl(id);

  if (real) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={real}
        alt={alt}
        className={`w-full h-full object-cover ${treatmentShape[treatment]} ${className}`}
        style={fill ? undefined : { aspectRatio: resolvedAspect }}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={alt}
      className={`relative overflow-hidden flex items-center justify-center ${TINT_BG[tint]} ${treatmentShape[treatment]} ${className}`}
      style={fill ? undefined : { aspectRatio: resolvedAspect }}
    >
      <div className="fy-grain absolute inset-0 opacity-60" aria-hidden="true" />
      <div className={`relative z-10 flex flex-col items-center gap-1.5 px-4 text-center ${TINT_TEXT[tint]}`}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-body text-eyebrow uppercase tracking-wider opacity-70">{resolvedKind}</span>
        <span className="text-[10px] font-mono opacity-60 break-all leading-tight">{id}</span>
      </div>
    </div>
  );
}
