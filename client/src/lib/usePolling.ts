'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from './api';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Phase 2's honest polling stand-in for the real-time push Phase 3 adds.
 * Fetches immediately, then every `intervalMs` while the tab is visible —
 * paused (not just slowed) when the tab is hidden so a backgrounded tab
 * doesn't keep spending the caller's rate-limit budget for no visible
 * benefit.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    try {
      const result = await fetcherRef.current();
      setData(result);
      setState('ready');
      setError(null);
    } catch (err) {
      setState('error');
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong loading this.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      if (cancelled || document.hidden) return;
      await load();
    }

    tick();
    timer = setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, load, ...deps]);

  return { data, state, error, reload: load, setData };
}
