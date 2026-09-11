'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { DataTable } from '@/components/admin/DataTable';
import { ConsoleHead } from '@/components/admin/ConsoleHead';
import { StatusChip } from '@/components/ui/StatusChip';

interface AuditEntry {
  _id: string;
  actorId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  timestamp: string;
}

const inputClass =
  'min-h-[46px] px-4 rounded-cell border border-fy-brown/15 bg-fy-card shadow-card font-body text-body text-fy-ink placeholder:text-fy-muted/70 outline-none focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/15 transition-shadow';

// Restyled onto the ip-* tonal system per DESIGN_INVENTORY.md's
// system_audit_trail row, moved onto the shared DataTable component. Same
// data source as before (GET /api/admin/audit-log, unchanged) — this
// already covers "immutable, filterable" (AuditLog.ts has no
// update/delete anywhere in the codebase; this page's filters +
// pagination are the "filterable" half), so this pass is UI-only.
export default function AdminAuditLogPage() {
  const t = useTranslations('adminAuditLog');
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [page, setPage] = useState(1);

  const { data, state } = usePolling(
    () =>
      api.get<{ entries: AuditEntry[]; total: number; page: number; limit: number }>(
        `/api/admin/audit-log?page=${page}${action ? `&action=${encodeURIComponent(action)}` : ''}${
          targetType ? `&targetType=${encodeURIComponent(targetType)}` : ''
        }`
      ),
    20000,
    [action, targetType, page]
  );

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <ConsoleHead eyebrow={t('eyebrow')} title={t('title')} subtitle={t('subtitle')} />

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          placeholder={t('filterByAction')}
          aria-label={t('filterByAction')}
          className={inputClass}
        />
        <input
          value={targetType}
          onChange={(e) => {
            setPage(1);
            setTargetType(e.target.value);
          }}
          placeholder={t('filterByTarget')}
          aria-label={t('filterByTarget')}
          className={inputClass}
        />
      </div>

      <div className="max-w-5xl">
        <DataTable<AuditEntry>
          rows={entries}
          rowKey={(e) => e._id}
          loading={state === 'loading' && entries.length === 0}
          emptyTitle={t('noMatching')}
          columns={[
            { key: 'time', header: t('time'), render: (e) => <span className="whitespace-nowrap text-fy-ink-soft">{new Date(e.timestamp).toLocaleString('en-IN')}</span> },
            { key: 'actor', header: t('actor'), render: (e) => <StatusChip tone="secondary">{e.actorRole}</StatusChip> },
            { key: 'action', header: t('action'), render: (e) => <span className="font-medium">{e.action}</span> },
            {
              key: 'target',
              header: t('target'),
              render: (e) => (
                <span className="text-fy-ink-soft whitespace-nowrap">
                  {e.targetType} · {e.targetId.slice(-6)}
                </span>
              ),
            },
            {
              key: 'details',
              header: t('details'),
              className: 'max-w-xs truncate',
              render: (e) => <span className="text-fy-ink-soft">{JSON.stringify(e.details)}</span>,
            },
          ]}
        />
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm font-medium text-fy-brown disabled:text-fy-ink-soft disabled:cursor-not-allowed"
          >
            {t('previous')}
          </button>
          <span className="text-sm text-fy-ink-soft">{t('pageOf', { page, totalPages })}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-sm font-medium text-fy-brown disabled:text-fy-ink-soft disabled:cursor-not-allowed"
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}
