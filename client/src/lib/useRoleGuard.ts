'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { roleHome } from '@/lib/roleHome';

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
export function useRoleGuard(allowed: readonly string[]) {
  const { user, loading, error } = useAuth();
  const router = useRouter();
  const permitted = !!user && allowed.includes(user.role);

  useEffect(() => {
    if (loading || error) return;
    if (!user) router.replace('/login');
    else if (!allowed.includes(user.role)) router.replace(roleHome(user.role));
    // `allowed` is a literal at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, user, router]);

  return { user, permitted };
}
