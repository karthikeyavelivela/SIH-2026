'use client';

import { useParams } from 'next/navigation';
import { DisputeDetailView } from '@/components/disputes/DisputeDetailView';

// DESIGN_INVENTORY.md dispute_refund_resolution detail half. The screen
// itself is shared with society leaders and federations (P1.5); admins use
// the admin endpoints and can act on a dispute at any level.
export default function AdminDisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DisputeDetailView id={id} apiBase="/api/admin/disputes" backHref="/admin/disputes" />;
}
