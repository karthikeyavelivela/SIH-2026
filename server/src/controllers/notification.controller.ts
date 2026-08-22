import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Notification } from '../models/Notification';

const PAGE_SIZE = 20;

/** GET /api/notifications — own notifications only, newest first, plus the unread count for the bell badge. */
export const listMyNotifications = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, Number(req.query.page) || 1);

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, read: false }),
  ]);

  res.status(200).json({ notifications, total, page, limit: PAGE_SIZE, unreadCount });
});

/** GET /api/notifications/unread-count — cheap poll target for the bell badge alone, no list payload. */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const unreadCount = await Notification.countDocuments({ userId: req.user!.id, read: false });
  res.status(200).json({ unreadCount });
});

/** PATCH /api/notifications/:id/read — IDOR-safe: the filter includes userId, not just _id, same pattern as every other owner-scoped mutation in this codebase. */
export const markRead = asyncHandler(async (req: Request, res: Response) => {
  const result = await Notification.updateOne({ _id: req.params.id, userId: req.user!.id }, { read: true });
  if (result.matchedCount === 0) throw new ApiError(404, 'Notification not found');
  res.status(200).json({ ok: true });
});

/** PATCH /api/notifications/read-all */
export const markAllRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.updateMany({ userId: req.user!.id, read: false }, { read: true });
  res.status(200).json({ ok: true });
});
