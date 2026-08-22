import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import { ApiError } from '../utils/ApiError';
import { t } from '../i18n/messages';
import { resolveLocale } from '../i18n/resolveLocale';

export function validate(req: Request, _res: Response, next: NextFunction): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // express-validator's default error shape echoes back the submitted
    // `value` for the failing field. Several routes validate `password`
    // fields, so passing errors.array() straight through would put
    // plaintext passwords in the HTTP response body — captured by
    // APM/error-tracking tools, proxy logs, browser devtools history, etc.
    // Strip `value` from every entry; field name + message is all a client
    // needs to fix its request.
    const safeErrors = errors.array().map((e) => {
      const { value: _value, ...rest } = e as Record<string, unknown>;
      return rest;
    });
    next(new ApiError(400, t('Validation failed', resolveLocale(req)), safeErrors));
    return;
  }
  next();
}
