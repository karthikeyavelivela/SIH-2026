import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/token.service';
import { ApiError } from '../utils/ApiError';
import type { Role } from '@fyro/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export function verifyJwt(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.accessToken;
  if (!token) {
    next(new ApiError(401, 'Not authenticated'));
    return;
  }
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}
