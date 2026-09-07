/**
 * Every image slot in the product, by id. `<Media id="..." />` looks
 * itself up here for aspect/subject; when a real asset exists it is listed
 * in REAL_ASSETS below and this is the ONLY file that changes — zero page
 * edits, per Non-negotiable #3.
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
  'landing.guild.household': {
    kind: 'photo',
    aspect: 1.9,
    dims: '900x470',
    subject: 'A skilled household tradesperson at work',
    usedOn: ['/ guild cards'],
  },
  'landing.guild.hamali': {
    kind: 'photo',
    aspect: 1.9,
    dims: '900x470',
    subject: 'A loading crew moving sacks at a mandi or godown',
    usedOn: ['/ guild cards'],
  },
  'landing.guild.transport': {
    kind: 'photo',
    aspect: 1.9,
    dims: '900x470',
    subject: 'Goods vehicles on a regional freight corridor',
    usedOn: ['/ guild cards'],
  },
  'login.hero': {
    kind: 'photo',
    aspect: 2.4,
    dims: '1200x500',
    subject: 'A cooperative society office — the place a member passbook is actually kept',
    usedOn: ['/login'],
  },
  'transport.hero': {
    kind: 'photo',
    aspect: 1.8,
    dims: '1200x670',
    subject: 'A loaded goods truck on a highway corridor',
    usedOn: ['/customer/book/transport'],
  },
  'labour.crew': {
    kind: 'photo',
    aspect: 3,
    dims: '1200x400',
    subject: 'Hamali crew carrying sacks — the duotone strip on the labour booking screen',
    usedOn: ['/customer/book/labour'],
  },
  'labour.crew.loading': {
    kind: 'photo',
    aspect: 3,
    dims: '1200x400',
    subject: 'Cement sacks being loaded onto a truck',
    usedOn: ['/customer/book/labour'],
  },
  'household.category.<slug>': {
    kind: 'photo',
    aspect: 1,
    dims: '480x480',
    subject:
      'One photograph per household service category (electrician, plumber, cleaning, ...) — <slug> is the category key from GET /api/service-categories',
    usedOn: ['/customer/dashboard category grid', '/customer/service/[slug]'],
  },
  'worker.portrait.<workerId>': {
    kind: 'photo',
    aspect: 1,
    dims: '200x200',
    subject:
      'Portrait of an authentic Indian tradesperson/cooperative worker — a stand-in until real KYC-verified profile photos exist',
    usedOn: ['Avatar fallback across all worker-facing cards'],
  },
  'cargo.<goodsType>': {
    kind: 'render',
    aspect: 1,
    dims: '480x480',
    subject:
      'One icon-style render per GOODS_TYPES value (construction_material, industrial_machinery, perishables, furniture, documents_parcels, general_goods)',
    usedOn: ['/customer/book/transport cargo chips', '/customer/book/labour material chips'],
  },
  'doc.certificate': {
    kind: 'render',
    aspect: 1,
    dims: '480x480',
    subject: 'Folded certificate with a raised cooperative seal',
    usedOn: ['/driver/certifications', '/hamali/certifications', 'training academy'],
  },
  'doc.identity': {
    kind: 'render',
    aspect: 1,
    dims: '480x480',
    subject: 'Identity documents with a verified checkmark badge',
    usedOn: ['KYC upload', '/admin/kyc-queue'],
  },
  'warehouse.hero': {
    kind: 'photo',
    aspect: 1.6,
    dims: '1200x750',
    subject: 'Warehouse interior with dock activity',
    usedOn: ['/warehouse-hub/dashboard'],
  },
  'analytics.hero': {
    kind: 'render',
    aspect: 1.6,
    dims: '1200x750',
    subject: 'Data and KPI composition',
    usedOn: ['/admin/analytics', '/admin/reports'],
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

/**
 * Real assets, checked FIRST by <Media>. Any id not listed here still falls
 * through to the designed placeholder, so adding artwork is always additive
 * and never breaks a page.
 *
 * These are delivered from Cloudinary rather than /public because they are
 * supplied art, not build output: keeping them out of the repo keeps the
 * bundle small and lets the art be re-cut without a deploy. They are plain
 * <img> sources (see Media.tsx), so no next/image domain config is needed.
 */
const CL = {
  /** Documentary scenes of real Indian trades and freight work. */
  scene: (file: string) => `https://res.cloudinary.com/xwtckfcl/image/upload/${file}`,
  /** Environments and people. */
  place: (file: string) => `https://res.cloudinary.com/blewsamc/image/upload/f_auto,q_auto/${file}`,
  /** Object/tool illustrations. */
  tool: (file: string) => `https://res.cloudinary.com/teqtnnpd/image/upload/${file}`,
  /** Cargo and document renders. */
  render: (file: string) => `https://res.cloudinary.com/zlcfqky2/image/upload/${file}`,
};

const REAL_ASSETS: Partial<Record<string, string>> = {
  // --- household service categories -------------------------------------
  // One real scene per category, matched to the trade rather than a generic
  // stock image. The slugs are seedServiceCategories.ts's own.
  'household.category.electrician': CL.scene('v1788766302/6615df53-fe5c-4c02-bf5c-eed8795ccfc4.png'),
  'household.category.plumber': CL.scene('v1788766484/f754a25b-b795-47cd-9fa2-a3e1b04bb9a5.png'),
  'household.category.carpenter': CL.scene('v1788766516/62871032-5ef6-4bf5-b940-a3efdadf7b43.png'),
  'household.category.painter': CL.scene('v1788766529/fcc06865-14fd-4e8c-98fc-c97bc26abb41.png'),
  'household.category.technician': CL.scene('v1788766539/bf44cc14-00a0-40ed-84cc-82401bdf21e1.png'),
  'household.category.cleaner': CL.scene('v1788766547/dc32835d-4947-4014-8020-90aa138dbb30.png'),
  'household.category.domestic_helper': CL.scene('v1788766578/a91d2cc3-a46e-4b11-9e6c-a9b28fc15c9f.png'),
  'household.category.gardener': CL.scene('v1788766566/f82332b5-4d7d-4547-8cd7-50e7a8713c83.png'),
  // No caregiving scene was supplied; the stethoscope render is the honest
  // stand-in rather than reusing an unrelated trade's photograph.
  'household.category.caregiver': CL.tool('v1788789758/ChatGPT_Image_Sep_7_2026_07_31_03_PM.png'),
  'household.category.driver': CL.place('21.Truck_Driver'),
  'household.category.general_logistics': CL.place('16.Lorry'),
  'household.category.general_labour': CL.scene('v1788766588/8fe31472-e9a7-4935-983a-eceb918ac674.png'),

  // --- marketing and booking heroes -------------------------------------
  'landing.hero': CL.scene('v1788766757/703b998b-55c2-484d-9e0e-c1bc5b484318.png'),
  'landing.guild.household': CL.place('30.Woman_with_toolbag'),
  'landing.guild.hamali': CL.scene('v1788766592/bc01a6f6-cd1f-487f-9559-a1912a888a67.png'),
  'landing.guild.transport': CL.place('20.Convoy_of_three_Indian_goods'),
  'login.hero': CL.place('24.Cooperative_Society_Office'),
  'transport.hero': CL.scene('v1788767119/10434285-8f80-48c2-8dc4-38353c793d44.png'),
  'labour.crew': CL.scene('v1788766588/8fe31472-e9a7-4935-983a-eceb918ac674.png'),
  'labour.crew.loading': CL.scene('v1788766611/72d62d1c-0623-4d94-addf-603bf8927449.png'),

  // --- cargo classification renders -------------------------------------
  'cargo.construction_material': CL.render('v1788791015/ChatGPT_Image_Sep_7_2026_07_52_57_PM.png'),
  'cargo.steel': CL.render('v1788791249/ChatGPT_Image_Sep_7_2026_07_57_06_PM.png'),
  'cargo.perishables': CL.render('f_auto,q_auto/ChatGPT_Image_Sep_7_2026_07_22_25_PM'),
  'cargo.furniture': CL.render('v1788789463/ChatGPT_Image_Sep_7_2026_07_26_32_PM.png'),
  'cargo.industrial_machinery': CL.render('v1788789666/ChatGPT_Image_Sep_7_2026_07_30_29_PM.png'),
  'cargo.documents_parcels': CL.render('v1788789848/ChatGPT_Image_Sep_7_2026_07_33_56_PM.png'),
  'cargo.general_goods': CL.render('v1788790231/ChatGPT_Image_Sep_7_2026_07_40_10_PM.png'),

  // --- documents, places, data ------------------------------------------
  'doc.certificate': CL.render('v1788789963/ChatGPT_Image_Sep_7_2026_07_35_48_PM.png'),
  'doc.identity': CL.render('v1788790121/ChatGPT_Image_Sep_7_2026_07_37_55_PM.png'),
  'warehouse.hero': CL.place('25.Warehouse_Interior'),
  'analytics.hero': CL.render('v1788790364/ChatGPT_Image_Sep_7_2026_07_42_21_PM.png'),
  'about.team': CL.place('24.Cooperative_Society_Office'),

  // --- vehicle class renders --------------------------------------------
  'vehicle.vehicle_small': CL.place('18.Tractor'),
  'vehicle.vehicle_medium': CL.place('16.Lorry'),
  'vehicle.vehicle_large': CL.render('v1788790523/ChatGPT_Image_Sep_7_2026_07_45_06_PM.png'),
  'vehicle.convoy': CL.render('v1788790635/ChatGPT_Image_Sep_7_2026_07_46_56_PM.png'),
  'vehicle.container': CL.place('17.Blue_Container'),
};

/**
 * Portrait stand-ins, used only where a worker has no uploaded profile
 * photo. Picked by a stable hash of the id so the same worker always gets
 * the same face rather than a new one on every render.
 */
const PORTRAITS = [
  CL.place('26.Indian_man'),
  CL.place('27.Indian_woman'),
  CL.place('28.Young_Indian_man'),
  CL.place('29.Older_truck_driver'),
  CL.place('30.Woman_with_toolbag'),
];

export function assetUrl(id: string): string | undefined {
  const direct = REAL_ASSETS[id];
  if (direct) return direct;

  if (id.startsWith('worker.portrait.')) {
    const key = id.slice('worker.portrait.'.length);
    let hash = 0;
    for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
    return PORTRAITS[hash % PORTRAITS.length];
  }

  return undefined;
}
