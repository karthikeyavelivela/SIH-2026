// MINIMAL app.ts — scoped to Task 9 (auth controller/routes) only.
// Task 11 owns the full app.ts (helmet, cors-with-env-origin, admin routes,
// 404 handler, central error handler) and MUST REPLACE this file wholesale,
// not merge into it.
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.routes';
import { ApiError } from './utils/ApiError';
import type { Request, Response, NextFunction } from 'express';

export const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);

// Minimal error handler so ApiError instances produce the right status codes
// in this task's tests. Task 11 replaces this app.ts with the full version
// (helmet, cors, admin routes, 404 handler) — this is intentionally minimal.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message, details: err.details });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
