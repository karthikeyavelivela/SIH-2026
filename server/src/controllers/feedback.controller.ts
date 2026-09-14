import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Feedback } from '../models/Feedback';
import { ServiceCategory } from '../models/ServiceCategory';

/**
 * Product feedback, and the demand signal hiding inside it.
 *
 * Anyone signed in may submit and may read their own. Admin and manager read
 * all of it, and get one extra view: requested services, counted. That view is
 * the whole reason the 'service_request' category exists — a trade people keep
 * asking for is a fact about the market, and until now it left no trace
 * anywhere in the system.
 */

export const submit = asyncHandler(async (req: Request, res: Response) => {
  const { category, message, requestedService, screenshotUrl } = req.body;

  if (category === 'service_request' && !requestedService?.trim()) {
    throw new ApiError(400, 'Which service would you like us to offer?');
  }

  const feedback = await Feedback.create({
    userId: req.user!.id,
    userRole: req.user!.role,
    category,
    message,
    requestedService: requestedService?.trim(),
    screenshotUrl,
  });

  res.status(201).json({ feedback });
});

/** Mine, with its status — so submitting does not feel like a void. */
export const listMine = asyncHandler(async (req: Request, res: Response) => {
  const feedback = await Feedback.find({ userId: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(30)
    .select('category message requestedService status adminNote createdAt')
    .lean();
  res.status(200).json({ feedback });
});

export const listAll = asyncHandler(async (req: Request, res: Response) => {
  const { status, category } = req.query as { status?: string; category?: string };
  const feedback = await Feedback.find({
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('userId', 'name phone role')
    .lean();
  res.status(200).json({ feedback });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  const feedback = await Feedback.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status, adminNote: req.body.adminNote, handledByUserId: req.user!.id },
    { new: true }
  );
  if (!feedback) throw new ApiError(404, 'Feedback not found');
  res.status(200).json({ feedback });
});

/**
 * Services people asked for that FYRO does not offer.
 *
 * Grouped case-insensitively and counted, with anything that already exists as
 * a category filtered out — a request for something already on the list is a
 * discovery problem, not a catalogue gap, and mixing the two would hide the
 * real signal.
 */
export const demandForNewServices = asyncHandler(async (_req: Request, res: Response) => {
  const requests = await Feedback.find({ category: 'service_request' })
    .select('requestedService createdAt')
    .lean();

  const existing = new Set(
    (await ServiceCategory.find().select('name slug').lean()).flatMap((c) => [
      c.name.toLowerCase(),
      c.slug.replace(/_/g, ' '),
    ])
  );

  const counts = new Map<string, { label: string; count: number; latest: Date }>();
  for (const r of requests) {
    const raw = (r.requestedService ?? '').trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (existing.has(key)) continue;
    const current = counts.get(key);
    counts.set(key, {
      label: current?.label ?? raw,
      count: (current?.count ?? 0) + 1,
      latest: current && current.latest > r.createdAt ? current.latest : r.createdAt,
    });
  }

  res.status(200).json({
    demand: [...counts.values()].sort((a, b) => b.count - a.count || +b.latest - +a.latest),
  });
});
