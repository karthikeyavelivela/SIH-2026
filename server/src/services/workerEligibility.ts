import { ServiceCategory } from '../models/ServiceCategory';
import type { IHamaliProfile, WorkerKind } from '../models/HamaliProfile';

/**
 * Who may be offered, shown, or accept a given job.
 *
 * Household trades, farm work and loading work all dispatch through the same
 * hamali pipeline (offers, open-jobs feed, accept, start, complete, earnings),
 * and until this existed nothing in that pipeline looked at skills: a plumbing
 * booking was offered to whichever online hamali happened to be nearest, and a
 * loading crew member could accept an electrician's job. Each category already
 * names the skill it needs (ServiceCategory.requiredSkills); this is the one
 * place that reads it, so the offer engine, the feed and the accept path can
 * never disagree about who a job is for.
 *
 *   hamali  (loading / general labour) — any job whose required skills they
 *           hold. General labour and uncategorised crew jobs require none, so
 *           they see all of those; a trade job only if they hold that trade.
 *   skilled (household trades)          — only jobs for a trade they hold.
 *           A plumber signed up to fix taps, not to carry cement.
 *   agri    (farm labour)               — only jobs that require farm work.
 */

/** The household trades a skilled worker can hold — ServiceCategory.requiredSkills vocabulary. */
export const TRADE_SKILLS = [
  'electrical',
  'plumbing',
  'carpentry',
  'painting',
  'domestic_help',
  'caregiving',
  'gardening',
  'cleaning',
  'technician',
] as const;

export const AGRI_SKILL = 'agricultural';

type ProfileLike = Pick<IHamaliProfile, 'skills'> & { workerKind?: WorkerKind };

export function kindOf(profile: ProfileLike): WorkerKind {
  return profile.workerKind ?? 'hamali';
}

/**
 * `requiredSkills` is null for a booking with no category (crew bookings
 * placed from the labour screen before categories existed).
 */
export function isEligible(profile: ProfileLike, requiredSkills: string[] | null): boolean {
  const kind = kindOf(profile);
  const required = requiredSkills ?? [];
  const holds = required.every((s) => profile.skills.includes(s));

  if (kind === 'skilled') return required.length > 0 && required.some((s) => TRADE_SKILLS.includes(s as never)) && holds;
  if (kind === 'agri') return required.includes(AGRI_SKILL) && holds;
  return holds;
}

/** Skills a booking's category requires; null when the booking has no category. */
export async function requiredSkillsFor(serviceCategorySlug?: string | null): Promise<string[] | null> {
  if (!serviceCategorySlug) return null;
  const category = await ServiceCategory.findOne({ slug: serviceCategorySlug }).select('requiredSkills').lean();
  return category?.requiredSkills ?? [];
}

/**
 * A Mongo filter on Booking that keeps only the jobs this worker is eligible
 * for — the feed's half of the rule above. Built from the category table, so
 * a category added later (farm labour was) is picked up without a code change.
 */
export async function bookingFilterFor(profile: ProfileLike): Promise<Record<string, unknown>> {
  const categories = await ServiceCategory.find({ dispatchType: 'hamali' }).select('slug requiredSkills').lean();
  const slugs = categories.filter((c) => isEligible(profile, c.requiredSkills ?? [])).map((c) => c.slug);
  const categorised = { serviceCategorySlug: { $in: slugs } };
  // Only loading workers take uncategorised crew jobs.
  if (kindOf(profile) !== 'hamali') return categorised;
  return { $or: [categorised, { serviceCategorySlug: { $exists: false } }, { serviceCategorySlug: null }] };
}
