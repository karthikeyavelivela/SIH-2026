'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, ApiClientError } from './api';

export interface AuthUser {
  _id: string;
  name: string;
  phone: string;
  role: string;
  accountStatus: string;
  permissions: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  // Set only when the last session check failed for a reason OTHER than
  // "not logged in" (network failure, 5xx, etc.) — lets a page distinguish
  // "you're logged out" from "we couldn't check, try again" instead of
  // treating both the same way.
  error: string | null;
  refetch: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchMe() {
    try {
      const res = await api.get<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
      setError(null);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        // Expected, normal "not logged in" state — not an error.
        setUser(null);
        setError(null);
      } else {
        // Network failure, 5xx, or anything else unexpected: don't silently
        // swallow it. Surface via `error` so a page can show a retry
        // affordance instead of indistinguishably treating this as "logged
        // out", and log it so a flaky-network report isn't undebuggable.
        // eslint-disable-next-line no-console
        console.error('Failed to check auth session:', err);
        setError(err instanceof Error ? err.message : 'Could not check your session');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMe();
  }, []);

  async function logout() {
    await api.post('/api/auth/logout');
    setUser(null);
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
