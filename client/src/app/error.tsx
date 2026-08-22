'use client';

import { ErrorBoundaryContent } from '@/components/ui/ErrorBoundaryContent';

// Catches render errors in the marketing/auth route tree (everything NOT
// under a role's own layout, e.g. `/`, `/login`, `/signup/*`,
// `/how-it-works`) that isn't already handled by a more specific error.tsx
// closer to the failing segment. See each role directory's own error.tsx
// for the role-scoped versions that keep that role's sidebar/bottom-nav
// visible instead of blanking the whole page.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryContent error={error} reset={reset} homeHref="/" />;
}
