import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny, z } from 'zod';
import { ApiError } from '../utils/ApiError';

/**
 * zod-based request validation for routes added in the SIH final build.
 *
 * Parses `body`, `query` and `params` against the given schemas and
 * REPLACES them with the parsed values, so a handler only ever sees data
 * that passed (coerced numbers, trimmed strings, stripped unknown keys).
 * Failures become a 400 with field paths and messages — never the
 * submitted values, which may include secrets or personal data.
 */
export function validateZod(schemas: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: { path: string; message: string }[] = [];
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          issues.push({ path: [key, ...issue.path].join('.'), message: issue.message });
        }
      } else if (key === 'query') {
        // req.query is a getter in Express 5-style routers; assign per key.
        Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
      } else {
        (req as unknown as Record<string, unknown>)[key] = result.data;
      }
    }
    if (issues.length) {
      next(new ApiError(400, 'Validation failed', issues));
      return;
    }
    next();
  };
}

/** A 24-hex Mongo ObjectId string. */
export const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'must be an id');
