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
const SEED = [
  {
    key: 'itemised',
    title: 'See exactly what the worker takes home',
    body: 'Every price is broken down to the rupee before you confirm — our 1% cut, the society’s share, and their pay.',
    ctaLabel: 'Browse services',
    ctaHref: '/customer/services',
    mode: 'all' as const,
    order: 0,
  },
  {
    key: 'wage-floor',
    title: 'Every rate meets the AP minimum wage',
    body: 'Checked against Government of Andhra Pradesh Notification G/3186486/2026 before a worker can publish it.',
    ctaLabel: 'How it works',
    ctaHref: '/how-it-works',
    mode: 'all' as const,
    order: 1,
  },
  {
    key: 'scan',
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
    const existing = await PromoBanner.findOne({ sourceKey: marker }).select('_id').lean();
    if (existing) continue;

    await PromoBanner.create({
      title: banner.title,
      body: banner.body,
      ctaLabel: banner.ctaLabel,
      ctaHref: banner.ctaHref,
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
