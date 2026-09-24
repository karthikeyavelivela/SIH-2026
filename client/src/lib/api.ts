/*
 * Same origin whenever the app is deployed.
 *
 * Deployed pages reach the API through this site's own /api rewrite (see
 * next.config.js) so the session cookie is first-party. This is decided in
 * code rather than by leaving NEXT_PUBLIC_API_BASE empty, because a
 * dashboard variable of that name overrides the committed .env file — and
 * one pointing straight at Render would quietly bring back the iPhone
 * login loop this exists to end. Local development still talks to the
 * local server directly.
 */
const ENV_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:4000';
const onDeployedOrigin =
  typeof window !== 'undefined' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
export const API_BASE = onDeployedOrigin ? '' : ENV_API_BASE;

/* The localhost default is right for a developer machine and catastrophic
   anywhere else: a deployed build that falls back to it points every request
   at a server on the *visitor's* own machine, so the whole app silently has
   no data. That is exactly what happened once already, because the API base
   lived only in dashboard configuration that was never set.

   This says so loudly the first time it matters. It cannot throw — a broken
   base should still render the marketing pages — but it must not be silent,
   and it only runs in the browser so the build itself is unaffected. */
if (typeof window !== 'undefined' && API_BASE.includes('localhost')) {
  const servedFromLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  if (!servedFromLocalhost) {
    // eslint-disable-next-line no-console
    console.error(
      `[FYRO] NEXT_PUBLIC_API_BASE is not set for this build, so the API base is "${API_BASE}". ` +
        `This page is served from ${window.location.origin}, so every API call will fail. ` +
        `Set NEXT_PUBLIC_API_BASE (see client/.env.production).`
    );
  }
}

export class ApiClientError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/*
 * Silent session renewal.
 *
 * The access cookie lives 15 minutes; the refresh cookie lives 7 days. The
 * server has always had /api/auth/refresh, and nothing ever called it — so
 * every session ended at minute 15, and a PWA reopened after lunch opened
 * on the sign-in page. Now a 401 triggers one refresh and one retry.
 *
 * Single-flight, because refresh ROTATES the token: two parallel refreshes
 * would present the same refresh token twice, the second would be
 * rejected as a replay, and the person would be signed out by the very
 * mechanism meant to keep them in. Every request that 401s while a
 * refresh is in flight waits on that one.
 */
const NO_RETRY = ['/api/auth/refresh', '/api/auth/login', '/api/auth/signup'];
let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include', cache: 'no-store' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    // Every response here is live app state (availability, booking status,
    // requests feed...) — a browser serving a heuristically-cached GET from
    // its disk cache (no explicit Cache-Control from the server = fair game
    // for the browser to reuse) shows a driver as offline right after they
    // went online, an empty request feed after a real booking exists, etc.
    // Found live: GET /api/vehicles/me returned a stale cached body after a
    // real PATCH had already updated it.
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : undefined;

  if (res.status === 401 && !retried && !NO_RETRY.some((p) => path.startsWith(p))) {
    if (await refreshSession()) return request<T>(path, options, true);
  }

  if (!res.ok) {
    throw new ApiClientError(res.status, body?.error ?? res.statusText, body?.details);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'POST', body: data ? JSON.stringify(data) : undefined }),
  // PUT, for the handful of endpoints that genuinely replace a whole
  // resource rather than patching fields of it — a worker's published rate
  // card is one document they rewrite wholesale, not a field at a time.
  put: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PUT', body: data ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
