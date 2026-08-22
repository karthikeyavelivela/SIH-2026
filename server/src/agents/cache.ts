// "Rate limit and cache agent calls; do not invoke on every page load" —
// Phase 4's mandatory guardrail. In-memory, per-process (this app has no
// Redis/shared cache layer anywhere else either — matches the codebase's
// existing scale). A real multi-instance deployment would need a shared
// cache instead; documented here rather than silently assumed away.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export async function cached<T>(key: string, compute: () => Promise<T>, ttlMs = CACHE_TTL_MS): Promise<T> {
  const existing = store.get(key);
  if (existing && existing.expiresAt > Date.now()) {
    return existing.value as T;
  }
  const value = await compute();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Invalidates a cached agent result immediately — used when the underlying data changes (e.g. a new document upload should re-run the pre-check, not serve a stale one). */
export function invalidateCache(key: string): void {
  store.delete(key);
}
