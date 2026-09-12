import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { searchForRole } from '../services/search.service';
import type { Role } from '@fyro/shared';

/**
 * GET /api/search?q=
 *
 * The handler is this small on purpose: it has no knobs. There is no
 * `collection`, `scope`, `userId` or `role` parameter a client could send,
 * so the only thing that decides what comes back is the session — see
 * search.service.ts.
 */
export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2) {
    // Not an error: a one-character query is a person still typing, and
    // running it would scan every collection for nothing.
    res.status(200).json({ groups: [] });
    return;
  }

  const groups = await searchForRole(req.user!.id, req.user!.role as Role, q.slice(0, 100));
  res.status(200).json({ groups });
});
