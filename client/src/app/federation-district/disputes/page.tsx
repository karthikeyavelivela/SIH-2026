'use client';

import { DisputeQueueView } from '@/components/disputes/DisputeQueueView';

// P1.5 — the disputes waiting at this level, in this scope.
export default function FederationDistrictDisputesPage() {
  return <DisputeQueueView detailHref={(id) => `/federation-district/disputes/${id}`} />;
}
