'use client';

import { ErrorBoundaryContent } from '@/components/ui/ErrorBoundaryContent';

// Renders inside this role's own layout.tsx (Next.js error-boundary
// nesting) so the sidebar/bottom-nav stays visible -- only the content area
// shows the error, instead of blanking the whole screen.
export default function MuthaMemberError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryContent error={error} reset={reset} homeHref="/mutha-member/job" />;
}
