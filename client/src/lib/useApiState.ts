'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from './api';

export type ApiStatus = 'loading' | 'success' | 'empty' | 'error' | 'forbidden' | 'offline';

interface UseApiStateResult<T> {
  data: T | null;
  status: ApiStatus;
  errorMessage: string | null;
  reload: () => void;
  setData: (updater: T | null | ((prev: T | null) => T | null)) => void;
}

/**
 * The one place every list/dashboard/queue fetch on a redesigned page
 * should go through — Phase 0.6's guardrail against the exact bug class
 * PAGE_INVENTORY.md found twice (`/customer/dashboard`'s failed
 * `/api/bookings` call and `/admin/users`'s real 403, both silently
 * rendering the identical "no results" EmptyState). A page using this
 * hook physically cannot make that mistake: a 403 sets `status:'forbidden'`
 * and a network failure sets `status:'error'`, and neither is spellable as
 * `status:'empty'` — that value is only ever set when the fetch actually
 * succeeded and the result was a real, empty array/null.
 *
 * `isEmpty` decides success-with-no-data vs success-with-data; defaults to
 * "falsy or empty array", which covers the common cases without every
 * caller having to restate it.
 */
export function useApiState<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
  options: { isEmpty?: (data: T) => boolean } = {}
): UseApiStateResult<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [status, setStatus] = useState<ApiStatus>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const isEmptyRef = useRef(options.isEmpty);
  isEmptyRef.current = options.isEmpty;

  const load = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setStatus('offline');
      return;
    }
    setStatus((prev) => (prev === 'success' || prev === 'empty' ? prev : 'loading'));
    try {
      const result = await fetcherRef.current();
      setDataState(result);
      const empty = isEmptyRef.current
        ? isEmptyRef.current(result)
        : result == null || (Array.isArray(result) && result.length === 0);
      setStatus(empty ? 'empty' : 'success');
      setErrorMessage(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) {
        setStatus('forbidden');
        setErrorMessage(err.message);
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('offline');
        return;
      }
      setStatus('error');
      setErrorMessage(err instanceof ApiClientError ? err.message : 'Something went wrong loading this.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, ...deps]);

  useEffect(() => {
    const onOnline = () => load();
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const setData = useCallback((updater: T | null | ((prev: T | null) => T | null)) => {
    setDataState((prev) => (typeof updater === 'function' ? (updater as (p: T | null) => T | null)(prev) : updater));
  }, []);

  return { data, status, errorMessage, reload: load, setData };
}
