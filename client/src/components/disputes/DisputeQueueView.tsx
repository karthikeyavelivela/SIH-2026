'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { TicketCard } from '@/components/ui/TicketCard';
import { FilterChip } from '@/components/ui/FilterChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { AlertIcon } from '@/components/ui/icons';
import type { DisputeLevel } from './DisputeDetailView';

interface QueueRow {
  _id: string;
  claim: string;
  status: 'open' | 'investigating' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  raisedBy: { name: string } | null;
  level?: DisputeLevel;
  slaDueAt?: string;
}

const statusTone: Record<QueueRow['status'], 'muted' | 'secondary' | 'success' | 'danger'> = {
  open: 'muted',
  investigating: 'secondary',
  resolved: 'success',
  escalated: 'danger',
};

/**
 * P1.5 — a resolver's own dispute queue: what is waiting at their level
 * and in their scope, soonest deadline first, or what they have resolved.
 */
export function DisputeQueueView({ detailHref }: { detailHref: (id: string) => string }) {
  const t = useTranslations('disputeRouting');
  const tStatus = useTranslations('adminDisputes');
  const router = useRouter();
  const [show, setShow] = useState<'open' | 'resolved'>('open');
  const { data, state } = usePolling(
    () => api.get<{ disputes: QueueRow[] }>(`/api/dispute-queue${show === 'resolved' ? '?status=resolved' : ''}`),
    15000,
    [show]
  );
  const disputes = data?.disputes ?? [];

  return (
    <div className="animate-[fadeUp_400ms_ease-out] px-gutter max-w-3xl mx-auto py-6">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-fy-brown mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-heading font-extrabold mb-1">{t('queueTitle')}</h1>
      <p className="text-sm text-fy-ink-soft mb-6">{t('queueSubtitle')}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        <FilterChip active={show === 'open'} onClick={() => setShow('open')}>
          {t('waiting')}
        </FilterChip>
        <FilterChip active={show === 'resolved'} onClick={() => setShow('resolved')}>
          {t('resolvedByYou')}
        </FilterChip>
      </div>

      {state === 'loading' && !data && <Skeleton lines={4} className="h-14" />}

      {state !== 'loading' && disputes.length === 0 && (
        <div className="fy-surface-card">
          <EmptyState icon={<AlertIcon className="w-7 h-7" />} title={t('empty')} description={t('emptyDesc')} />
        </div>
      )}

      {disputes.length > 0 && (
        <div className="fy-surface-card divide-y divide-fy-muted/10">
          {disputes.map((d) => {
            const hours = d.slaDueAt ? Math.round((new Date(d.slaDueAt).getTime() - Date.now()) / 3_600_000) : null;
            const due = hours === null ? '' : hours > 0 ? ` · ${t('dueIn', { hours })}` : ` · ${t('overdue')}`;
            return (
              <TicketCard
                key={d._id}
                ticketId={d._id.slice(-6)}
                title={d.claim}
                status={tStatus(`status.${d.status}`)}
                statusTone={statusTone[d.status]}
                updatedAt={`${d.raisedBy?.name ?? '—'} · ${new Date(d.createdAt).toLocaleDateString('en-IN')}${d.status !== 'resolved' ? due : ''}`}
                onClick={() => router.push(detailHref(d._id))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
