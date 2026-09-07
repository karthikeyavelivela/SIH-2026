/**
 * Every image slot in the product, by id. `<Media id="..." />` looks
 * itself up here for aspect/subject; when real assets exist, drop the file
 * in (see `assetUrl` below) and this is the ONLY file that changes —
 * zero page edits, per Non-negotiable #3.
 *
 * `aspect` is width/height. `dims` is the intended final crop in px, for
 * whoever is producing the real photography/renders — not enforced at
 * runtime, just documented so the placeholder matches what's coming.
 */
export interface MediaManifestEntry {
  kind: 'photo' | 'render';
  aspect: number;
  dims: string;
  subject: string;
  usedOn: string[];
}

export const MEDIA_MANIFEST: Record<string, MediaManifestEntry> = {
  'brand.wordmark': {
    kind: 'render',
    aspect: 3.2,
    dims: '320x100',
    subject: 'FYRO wordmark + cooperative emblem (see fyro_wordmark_and_cooperative_emblem)',
    usedOn: ['TopBar', 'every layout header'],
  },
  'landing.hero': {
    kind: 'photo',
    aspect: 1.6,
    dims: '1600x1000',
    subject: 'Documentary photograph of Indian cooperative workers together — warm, dignified, not stock-photo staged',
    usedOn: ['/', 'marketing hero'],
  },
  'household.category.<slug>': {
    kind: 'render',
    aspect: 1,
    dims: '240x240',
    subject: 'One icon-style render per household service category (electrician, plumber, cleaning, ...) — <slug> is the category key from GET /api/service-categories',
    usedOn: ['/customer/dashboard category grid', '/customer/book category picker'],
  },
  'worker.portrait.<workerId>': {
    kind: 'photo',
    aspect: 1,
    dims: '200x200',
    subject: 'Studio portrait of an authentic Indian tradesperson/cooperative worker — used as a stand-in until real KYC-verified profile photos exist',
    usedOn: ['Avatar fallback across all worker-facing cards'],
  },
  'about.team': {
    kind: 'photo',
    aspect: 1.4,
    dims: '1200x860',
    subject: 'Cooperative workers/leadership, documentary style',
    usedOn: ['/about'],
  },
  'howItWorks.step.<n>': {
    kind: 'render',
    aspect: 1.2,
    dims: '480x400',
    subject: 'Illustrative render per step of the how-it-works flow',
    usedOn: ['/how-it-works'],
  },
  'onboarding.slide.<n>': {
    kind: 'render',
    aspect: 1,
    dims: '600x600',
    subject: 'Full-bleed onboarding-walkthrough illustration, one per slide',
    usedOn: ['/onboarding-walkthrough'],
  },
  'federation.emblem.<stateCode>': {
    kind: 'render',
    aspect: 1,
    dims: '160x160',
    subject: 'State/district federation seal-style emblem',
    usedOn: ['/federation-state/dashboard', '/federation-district/dashboard'],
  },
};

/** Real-asset resolver — checked FIRST by <Media>. Until a real file is
 * dropped in `/public/media/<id>.<ext>` and registered here, every id
 * falls through to the designed placeholder. This is the only function a
 * future "swap in the real photos" pass needs to touch. */
const REAL_ASSETS: Partial<Record<string, string>> = {
  // 'brand.wordmark': '/media/brand-wordmark.svg',
};

export function assetUrl(id: string): string | undefined {
  return REAL_ASSETS[id];
}
