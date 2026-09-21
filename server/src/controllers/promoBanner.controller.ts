import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { PromoBanner, BannerMode } from '../models/PromoBanner';
import { User } from '../models/User';
import { writeAuditLog } from '../services/audit.service';

/**
 * GET /api/promo-banners?mode=household
 *
 * What the customer home screen's promotional slot renders. Returns only
 * what is live right now — active, inside its window, for this mode, and
 * for this customer's region or every region.
 *
 * The window is evaluated HERE rather than in the client, because a client
 * clock is the user's clock: a phone set a week forward would otherwise see
 * a campaign that has not started.
 */
export const listLiveBanners = asyncHandler(async (req: Request, res: Response) => {
  const mode = (req.query.mode as BannerMode) ?? 'all';
  const now = new Date();

  const user = await User.findById(req.user!.id).select('region').lean();

  const banners = await PromoBanner.find({
    active: true,
    mode: { $in: ['all', mode] },
    $and: [
      { $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: { $exists: false } }, { endsAt: null }, { endsAt: { $gte: now } }] },
      user?.region
        ? { $or: [{ region: { $exists: false } }, { region: null }, { region: user.region }] }
        : { $or: [{ region: { $exists: false } }, { region: null }] },
    ],
  })
    .select('title body ctaLabel ctaHref imageUrl mode')
    .sort({ order: 1, createdAt: -1 })
    // Three is the most the carousel shows. Fetching more would mean
    // rendering a rail nobody can reach the end of.
    .limit(3)
    .lean();

  res.status(200).json({ banners });
});

/** GET /api/admin/promo-banners — everything, live or not, so an admin can see what is scheduled and what has expired. */
export const listAllBanners = asyncHandler(async (_req: Request, res: Response) => {
  const banners = await PromoBanner.find().sort({ active: -1, order: 1, createdAt: -1 }).lean();
  res.status(200).json({ banners });
});

export const createBanner = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;

  // A label with nowhere to go is a dead control, and a link with no label
  // is invisible. Rejected together rather than half-saved.
  if (Boolean(body.ctaLabel) !== Boolean(body.ctaHref)) {
    throw new ApiError(400, 'A call to action needs both a label and a link, or neither');
  }

  const banner = await PromoBanner.create({ ...body, createdByAdminId: req.user!.id });

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'promo_banner_created',
    targetType: 'PromoBanner',
    targetId: banner._id.toString(),
    details: { title: banner.title, mode: banner.mode, region: banner.region ?? null },
  });

  res.status(201).json({ banner });
});

export const updateBanner = asyncHandler(async (req: Request, res: Response) => {
  const banner = await PromoBanner.findById(req.params.id);
  if (!banner) throw new ApiError(404, 'Banner not found');

  const patch = req.body as Record<string, unknown>;
  const nextLabel = 'ctaLabel' in patch ? patch.ctaLabel : banner.ctaLabel;
  const nextHref = 'ctaHref' in patch ? patch.ctaHref : banner.ctaHref;
  if (Boolean(nextLabel) !== Boolean(nextHref)) {
    throw new ApiError(400, 'A call to action needs both a label and a link, or neither');
  }

  Object.assign(banner, patch);
  await banner.save();

  await writeAuditLog({
    actorId: req.user!.id,
    actorRole: req.user!.role,
    action: 'promo_banner_updated',
    targetType: 'PromoBanner',
    targetId: banner._id.toString(),
    details: { changed: Object.keys(patch) },
  });

  res.status(200).json({ banner });
});
