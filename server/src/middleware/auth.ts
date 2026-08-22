import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/token.service';
import { ApiError } from '../utils/ApiError';
import type { Role, AppLocale } from '@fyro/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      // locale is always populated (defaults to 'en') even though the JWT
      // claim itself is optional — see JwtAccessPayload's doc comment.
      // Phase 2 (server-side i18n) reads this to resolve error/response text.
      user?: { id: string; role: Role; locale: AppLocale };
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
    req.user = { id: payload.id, role: payload.role, locale: payload.locale ?? 'en' };
    next();
  } catch {
    next(new ApiError(401, 'Invalid or expired token'));
  }
}
