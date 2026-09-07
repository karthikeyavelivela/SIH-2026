import { ReactNode } from 'react';
import { Media } from '@/components/ui/Media';

/* Media — anatomy per DESIGN_TOKENS.md §4.
   Every photograph in the designs sits in a 16px-radius container under a
   gradient scrim in the mode's dark accent, with text over the bottom-left
   and an optional badge floating top-right.
   Taken from: household_home (hero + guild thumbnails + specialist
   portraits), hamali_labour_standard (wide duotone strip),
   society_governance (guild photo card), live_tracking_1 (worker portrait). */

type Scrim = 'brown' | 'slate' | 'none';

const scrimClass: Record<Scrim, string> = {
  brown: 'bg-gradient-to-t from-fy-brown via-fy-brown/45 to-transparent',
  slate: 'bg-gradient-to-t from-fy-slate via-fy-slate/45 to-transparent',
  none: '',
};

/**
 * Full-bleed photo with an overlay. `height` maps to the shapes seen in the
 * designs: hero ~240px, strip ~110px, tile ~96px.
 */
export function PhotoCard({
  id,
  alt,
  height = 'hero',
  scrim = 'brown',
  overlay,
  topRight,
  tint = 'household',
  className = '',
}: {
  id: string;
  alt: string;
  height?: 'hero' | 'strip' | 'tile';
  scrim?: Scrim;
  overlay?: ReactNode;
  topRight?: ReactNode;
  tint?: 'household' | 'labour' | 'transport';
  className?: string;
}) {
  const h = { hero: 'h-60', strip: 'h-28', tile: 'h-24' }[height];
  return (
    <div className={`relative w-full ${h} rounded-card overflow-hidden ${className}`}>
      <Media id={id} kind="photo" treatment="full-bleed" tint={tint} alt={alt} className="w-full h-full" />
      {scrim !== 'none' && <div className={`absolute inset-0 ${scrimClass[scrim]}`} />}
      {topRight && <div className="absolute top-3 right-3 z-10">{topRight}</div>}
      {overlay && <div className="absolute inset-x-0 bottom-0 p-4 z-10">{overlay}</div>}
    </div>
  );
}

/** Circular portrait, optionally with a badge pinned bottom-right. */
export function CircularPortrait({
  id,
  alt,
  size = 64,
  badge,
  className = '',
}: {
  id: string;
  alt: string;
  size?: number;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <Media
        id={id}
        kind="photo"
        treatment="circular"
        tint="household"
        alt={alt}
        className="w-full h-full rounded-full overflow-hidden"
      />
      {badge && <span className="absolute -bottom-0.5 -right-0.5">{badge}</span>}
    </div>
  );
}

/** Wide duotone strip with a caption bar across the bottom. */
export function PhotoStrip({
  id,
  alt,
  caption,
  tint = 'labour',
  className = '',
}: {
  id: string;
  alt: string;
  caption?: ReactNode;
  tint?: 'household' | 'labour' | 'transport';
  className?: string;
}) {
  return (
    <div className={`relative w-full h-28 rounded-card overflow-hidden ${className}`}>
      <Media id={id} kind="photo" treatment="full-bleed" tint={tint} alt={alt} className="w-full h-full" />
      <div className="absolute inset-0 bg-gradient-to-r from-fy-brown/80 via-fy-brown-soft/55 to-fy-green/35" />
      {caption && (
        <div className="absolute inset-x-0 bottom-0 p-3 flex items-center justify-between gap-2 text-fy-bone z-10">
          {caption}
        </div>
      )}
    </div>
  );
}
