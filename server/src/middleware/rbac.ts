import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { User } from '../models/User';
import type { Role } from '@fyro/shared';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new ApiError(403, 'Forbidden: insufficient role'));
      return;
    }
    next();
  };
}

/**
 * Admin always passes. Manager must hold `permission` in their live
 * permissions[] array, re-fetched from the DB on every call (not trusted
 * from the JWT) so Admin revocation takes effect immediately.
 */
export function requirePermission(permission: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(new ApiError(401, 'Not authenticated'));
      return;
    }
    if (req.user.role === 'admin') {
      next();
      return;
    }
    if (req.user.role !== 'manager') {
      next(new ApiError(403, 'Forbidden: insufficient role'));
      return;
    }
    const manager = await User.findById(req.user.id).select('permissions').lean();
    if (!manager || !manager.permissions.includes(permission)) {
      next(new ApiError(403, 'Forbidden: missing permission ' + permission));
      return;
    }
    next();
  };
}
