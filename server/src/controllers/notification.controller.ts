import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { Notification } from '../models/Notification';
import { modesForNotifications, type NotificationMode } from '../services/notificationMode';

const PAGE_SIZE = 20;

/**
 * GET /api/notifications — own notifications only, newest first, plus the
 * unread count for the bell badge.
 *
 * `?mode=` scopes the list to one of the customer's three worlds, because
 * switching mode is meant to change everything on the screen and this was
 * the last thing ignoring it. The mode is derived from the booking each
 * notification links to (see services/notificationMode.ts); anything with
 * no booking behind it — a KYC decision, a payout — has no mode and shows
 * everywhere.
 *
 * `otherModesCount` comes back alongside, so the screen can say how many
 * alerts are waiting elsewhere rather than hiding them without a trace.
 * Scoping that a person cannot see past is scoping that loses things.
 */
export const listMyNotifications = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Math.max(1, Number(req.query.page) || 1);
  const mode = req.query.mode as NotificationMode | undefined;

  if (!mode) {
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      Notification.countDocuments({ userId }),
      Notification.countDocuments({ userId, read: false }),
    ]);
    res.status(200).json({ notifications, total, page, limit: PAGE_SIZE, unreadCount, otherModesCount: 0 });
    return;
  }

  /*
   * Scoped read.
   *
   * The mode is not a column, so it cannot be a database filter — the rows
   * are fetched and then partitioned. Bounded at a few pages' worth rather
   * than the whole history, because a notification list is a recency
   * surface: nobody scrolls to last month, and an unbounded fetch on a
   * heavy account would be a slow query in the name of completeness.
   */
  const SCAN_LIMIT = PAGE_SIZE * 5;
  const recent = await Notification.find({ userId }).sort({ createdAt: -1 }).limit(SCAN_LIMIT).lean();
  const modes = await modesForNotifications(recent);

  const mine = recent.filter((n) => {
    const own = modes.get(String(n._id));
    // No booking behind it -> belongs to every mode.
    return own === undefined || own === mode;
  });
  const others = recent.length - mine.length;

  res.status(200).json({
    notifications: mine.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: mine.length,
    page,
    limit: PAGE_SIZE,
    unreadCount: mine.filter((n) => !n.read).length,
    otherModesCount: others,
  });
});

/** GET /api/notifications/unread-count — cheap poll target for the bell badge alone, no list payload. */
export const getUnreadCount = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const mode = req.query.mode as NotificationMode | undefined;

  // Unscoped is the cheap path, and the one every non-customer role takes.
  if (!mode) {
    const unreadCount = await Notification.countDocuments({ userId, read: false });
    res.status(200).json({ unreadCount });
    return;
  }

  // Scoped, so the badge counts what the list will actually show. A badge
  // that disagrees with its own list is worse than no badge.
  const unread = await Notification.find({ userId, read: false }).sort({ createdAt: -1 }).limit(100).lean();
  const modes = await modesForNotifications(unread);
  const unreadCount = unread.filter((n) => {
    const own = modes.get(String(n._id));
    return own === undefined || own === mode;
  }).length;
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
