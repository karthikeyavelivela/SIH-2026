'use client';

import { DisputeQueueView } from '@/components/disputes/DisputeQueueView';

// P1.5 — the disputes waiting at this level, in this scope.
export default function FederationStateDisputesPage() {
  return <DisputeQueueView detailHref={(id) => `/federation-state/disputes/${id}`} />;
}
