'use client';

import { DisputeQueueView } from '@/components/disputes/DisputeQueueView';

// P1.5 — the disputes waiting at this level, in this scope.
export default function MuthaDisputesPage() {
  return <DisputeQueueView detailHref={(id) => `/mutha/disputes/${id}`} />;
}
