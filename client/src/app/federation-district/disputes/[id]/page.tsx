'use client';

import { useParams } from 'next/navigation';
import { DisputeDetailView } from '@/components/disputes/DisputeDetailView';

// P1.5 — the shared dispute screen, through the scoped resolver endpoints.
export default function FederationDistrictDisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="px-gutter py-6">
      <DisputeDetailView id={id} apiBase="/api/dispute-queue" backHref="/federation-district/disputes" />
    </div>
  );
}
