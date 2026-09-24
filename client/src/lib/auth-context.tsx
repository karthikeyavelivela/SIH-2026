'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiClientError } from './api';
import { clearApiCache } from './apiCache';
import type { WorkerKind } from './workerArea';

export interface AuthUser {
  _id: string;
  name: string;
  email?: string;
  phone: string;
  role: string;
  // Solo workers only: which worker area they belong in. See lib/workerArea.ts.
  workerKind?: WorkerKind;
  // Every role this phone number holds — drives the role switcher
  // (Phase 6.1). Always contains `role`.
  roles: string[];
  region?: string;
  accountStatus: string;
  permissions: string[];
  licenseExpiryAt?: string;
  profilePhoto?: string;
  ratingAvg?: number;
  ratingCount?: number;
  createdAt?: string;
  notificationPreferences?: {
    push: { jobUpdates: boolean; payments: boolean; promotions: boolean };
    sms: { jobUpdates: boolean; payments: boolean; promotions: boolean };
  };
  privacySettings?: { shareLocationWhileOffline: boolean; profileVisibility: 'public' | 'private' };
  payoutDetails?: {
    method: 'bank' | 'upi';
    accountHolderName?: string;
    bankAccountNumber?: string;
    ifsc?: string;
    upiId?: string;
  };
  businessProfile?: { isBusiness: boolean; gstin?: string; companyName?: string };
  pendingPhoneChange?: { newPhone: string; expiresAt: string; attempts: number };
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  // Set only when the last session check failed for a reason OTHER than
  // "not logged in" (network failure, 5xx, etc.) — lets a page distinguish
  // "you're logged out" from "we couldn't check, try again" instead of
  // treating both the same way.
  error: string | null;
  // Resolves to the signed-in user, or null — so a caller that just logged
  // in can tell whether the session actually took.
  refetch: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
}

/**
 * Exported so tests can supply an auth value directly instead of standing up
 * a provider that would go to the network. Nothing in the app imports it.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
export type { AuthContextValue };

const RETRY_DELAYS_MS = [1500, 3000, 6000, 12000, 20000];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
   * A failed session check is not the same as "signed out".
   *
   * 401 means signed out, and is final. Anything else — the free-tier API
   * waking from sleep behind the proxy (a 502/504 for the better part of a
   * minute), a phone between cell towers — used to leave `user` null too,
   * and every role layout read null as "send them to sign-in". A person
   * with a perfectly good session was bounced to the login form, signed in
   * again, and — if the server was still waking — bounced again. That is
   * the loop, on exactly the slow mobile connections it was reported from.
   *
   * So a non-401 failure is retried with backoff (about 45 seconds in
   * total, long enough for a cold start), `loading` stays true meanwhile,
   * and only after that does `error` surface, which the layouts render as
   * "could not reach the server — retry", never as a redirect.
   */
  // `loading` is only ever true for the FIRST check. A later refetch (after
  // a profile edit, say) keeps showing the current user while it runs —
  // flipping loading back on would unmount every page behind the spinner.
  async function fetchMe(): Promise<AuthUser | null> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await api.get<{ user: AuthUser }>('/api/auth/me');
        setUser(res.user);
        setError(null);
        setLoading(false);
        return res.user;
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) {
          // Expected, normal "not logged in" state — not an error.
          setUser(null);
          setError(null);
          setLoading(false);
          return null;
        }
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        // eslint-disable-next-line no-console
        console.error('Failed to check auth session:', err);
        setError(err instanceof Error ? err.message : 'Could not check your session');
        setLoading(false);
        return null;
      }
    }
  }

  useEffect(() => {
    fetchMe();
  }, []);

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } finally {
      // Signed out on this device even if the server call failed — a
      // sign-out button that leaves you signed in because the network
      // blinked is worse than a stale server-side token that expires alone.
      // Everything the read-through cache is holding belonged to the person
      // who just signed out; the next person on this device must not read
      // their saved addresses out of memory.
      clearApiCache();
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, error, refetch: fetchMe, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
