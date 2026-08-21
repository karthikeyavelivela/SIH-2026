'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { TicketCard } from '@/components/ui/TicketCard';
import { FilterChip } from '@/components/ui/FilterChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { AlertIcon } from '@/components/ui/icons';

interface DisputeRow {
  _id: string;
  claim: string;
  status: 'open' | 'investigating' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  raisedBy: { name: string } | null;
}

const STATUS_FILTERS = ['', 'open', 'investigating', 'resolved', 'escalated'] as const;

const statusTone: Record<DisputeRow['status'], 'muted' | 'secondary' | 'success' | 'danger'> = {
  open: 'muted',
  investigating: 'secondary',
  resolved: 'success',
  escalated: 'danger',
};

// New page — DESIGN_INVENTORY.md dispute_refund_resolution queue half.
// Reads server/src/models/Dispute.ts (new) via
// server/src/controllers/dispute.controller.ts (new).
export default function AdminDisputesPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>('');
  const { data, state } = usePolling(
    () => api.get<{ disputes: DisputeRow[] }>(`/api/admin/disputes${status ? `?status=${status}` : ''}`),
    15000,
    [status]
  );

  const disputes = data?.disputes ?? [];

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Trust & safety</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Disputes & refunds</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">Claim vs system-record resolution queue.</p>

      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === '' ? 'All' : s}
          </FilterChip>
        ))}
      </div>

      {state === 'loading' && !data && <Skeleton lines={4} className="h-14" />}

      {state !== 'loading' && disputes.length === 0 && (
        <div className="ip-card max-w-2xl">
          <EmptyState icon={<AlertIcon className="w-7 h-7" />} title="No disputes" description="Nothing in this queue right now." />
        </div>
      )}

      <div className="ip-card max-w-3xl divide-y divide-ip-outline/10">
        {disputes.map((d) => (
          <TicketCard
            key={d._id}
            ticketId={d._id.slice(-6)}
            title={d.claim}
            status={d.status}
            statusTone={statusTone[d.status]}
            updatedAt={`${d.raisedBy?.name ?? 'Unknown'} · ${new Date(d.createdAt).toLocaleDateString('en-IN')} · ${d.priority} priority`}
            onClick={() => router.push(`/admin/disputes/${d._id}`)}
          />
        ))}
      </div>
    </div>
  );
}
