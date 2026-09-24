'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { roleHome } from '@/lib/roleHome';
import type { WorkerKind } from '@/lib/workerArea';

/**
 * Keeps a role's area for that role, without ever sending a signed-in
 * person to the sign-in page.
 *
 * Every role layout used to share one rule: "no user, or the wrong role,
 * goes to /login". The wrong-role half is the bug. A signed-in admin who
 * opened a customer link, or a customer whose session was fine but whose
 * role check ran against a stale value, landed on a sign-in form while
 * already signed in — and signing in again sent them straight back into
 * the same guard. Now:
 *
 *   - no session            -> /login
 *   - session, wrong area   -> that role's own home
 *   - session check failed  -> stay put; SessionGate offers a retry
 */
export function useRoleGuard(allowed: readonly string[], workerKind?: WorkerKind) {
  const { user, loading, error } = useAuth();
  const router = useRouter();
  // The three solo-worker areas share one role; the kind tells them apart.
  const kindOk = !workerKind || (user?.workerKind ?? 'hamali') === workerKind;
  const permitted = !!user && allowed.includes(user.role) && kindOk;

  useEffect(() => {
    if (loading || error) return;
    if (!user) router.replace('/login');
    else if (!allowed.includes(user.role) || !kindOk) router.replace(roleHome(user.role, user.workerKind));
    // `allowed` is a literal at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, user, router, kindOk]);

  return { user, permitted };
}
