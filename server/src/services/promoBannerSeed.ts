import { PromoBanner } from '../models/PromoBanner';
import { User } from '../models/User';

/**
 * The three banners the promotional rail starts with.
 *
 * A slot that renders nothing is the correct EMPTY state, not the correct
 * DEFAULT one — a customer opening the app for the first time should see
 * the rail the design calls for, and the platform does have things worth
 * saying.
 *
 * Every line here is a claim the product can actually meet, and each points
 * at the screen that proves it. That is the bar: a promotional banner is
 * still a statement the platform makes to every customer, and the fastest
 * way to make this app dishonest would be to put an offer here that nothing
 * honours.
 *
 * These are ordinary rows, not hardcoded copy. An admin can edit the text,
 * reorder them, schedule them or switch them off from the console, and this
 * seeder never touches a banner that already exists.
 */
/*
 * Every banner carries a photograph, because the home-screen rail is
 * image-only: its words are the banner's accessible name, not print on the
 * picture. These are the product's own commissioned photographs (the same
 * library as MEDIA_MANIFEST on the client), cropped server-side by
 * Cloudinary to the rail's 2:1 with g_auto keeping the subject in frame.
 * Chosen to carry no third-party branding — two otherwise good frames
 * showed a cement company's and a packaging firm's names.
 */
const crop = (cloud: string, file: string) =>
  `https://res.cloudinary.com/${cloud}/image/upload/c_fill,g_auto,ar_2:1,w_1200,f_auto,q_auto/${file}`;

const SEED = [
  {
    key: 'itemised',
    // A plumber at work under a kitchen sink.
    imageUrl: crop('xwtckfcl', 'v1788766484/f754a25b-b795-47cd-9fa2-a3e1b04bb9a5.png'),
    title: 'See exactly what the worker takes home',
    body: 'Every price is broken down to the rupee before you confirm — our 1% cut, the society’s share, and their pay.',
    ctaLabel: 'Browse services',
    ctaHref: '/customer/services',
    mode: 'all' as const,
    order: 0,
  },
  {
    key: 'wage-floor',
    // A tradeswoman with her tool bag — the person the wage floor protects.
    imageUrl: crop('blewsamc', '30.Woman_with_toolbag'),
    title: 'Every rate meets the AP minimum wage',
    body: 'Checked against Government of Andhra Pradesh Notification G/3186486/2026 before a worker can publish it.',
    ctaLabel: 'How it works',
    ctaHref: '/how-it-works',
    mode: 'all' as const,
    order: 1,
  },
  {
    key: 'scan',
    // An electrician diagnosing a distribution board.
    imageUrl: crop('xwtckfcl', 'v1788766302/6615df53-fe5c-4c02-bf5c-eed8795ccfc4.png'),
    title: 'Not sure who to call?',
    body: 'Photograph the problem and FYRO will tell you which trade it belongs to — or whether you can fix it yourself.',
    ctaLabel: 'Scan a problem',
    ctaHref: '/customer/scan',
    mode: 'household' as const,
    order: 2,
  },
];

/**
 * Seeds any missing starter banner and returns how many it created.
 *
 * Matched on a stable key rather than on the title, which is the field an
 * admin is most likely to edit: rewording a banner keeps it, and switching
 * one off keeps it off — the row still exists, so the seeder sees it and
 * leaves it alone.
 *
 * Switching off is the only removal the API offers. There is no DELETE
 * route, deliberately: a banner that was live is a statement the platform
 * made, and "when did we stop saying that" is worth being able to answer.
 */
export async function ensurePromoBanners(): Promise<number> {
  const admin = await User.findOne({ role: 'admin' }).select('_id').lean();
  // Nothing to attribute them to yet. The admin seeder runs first in every
  // real deployment; skipping is correct rather than inventing an author.
  if (!admin) return 0;

  let created = 0;
  for (const banner of SEED) {
    const marker = `seed:${banner.key}`;
    const existing = await PromoBanner.findOne({ sourceKey: marker }).select('_id imageUrl').lean();
    if (existing) {
      // Banners seeded before the rail went image-only have no picture and
      // would be skipped by it. Give them theirs — but only if nobody has
      // set one, so an admin's own image is never replaced.
      if (!existing.imageUrl) {
        await PromoBanner.updateOne({ _id: existing._id, imageUrl: { $in: [null, ''] } }, { imageUrl: banner.imageUrl });
      }
      continue;
    }

    await PromoBanner.create({
      title: banner.title,
      body: banner.body,
      ctaLabel: banner.ctaLabel,
      ctaHref: banner.ctaHref,
      imageUrl: banner.imageUrl,
      mode: banner.mode,
      order: banner.order,
      active: true,
      sourceKey: marker,
      createdByAdminId: admin._id,
    });
    created += 1;
  }
  return created;
}
