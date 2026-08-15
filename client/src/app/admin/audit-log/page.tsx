'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';

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
  'min-h-[40px] px-3.5 py-2 rounded-md border border-border bg-background text-sm placeholder:text-text-muted/70 focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20 transition-colors duration-fast';

export default function AdminAuditLogPage() {
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
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">Trust & safety</p>
      <h1 className="font-heading text-2xl font-bold mb-1">Audit log</h1>
      <p className="text-sm text-text-muted mb-6">Every admin/manager action — role changes, deletions, fare rule edits, complaint resolutions.</p>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={action}
          onChange={(e) => {
            setPage(1);
            setAction(e.target.value);
          }}
          placeholder="Filter by action…"
          aria-label="Filter by action"
          className={inputClass}
        />
        <input
          value={targetType}
          onChange={(e) => {
            setPage(1);
            setTargetType(e.target.value);
          }}
          placeholder="Filter by target type…"
          aria-label="Filter by target type"
          className={inputClass}
        />
      </div>

      <div className="rounded-lg border border-border bg-surface-raised shadow-sm overflow-x-auto max-w-5xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-muted">
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e._id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 whitespace-nowrap text-text-muted">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 whitespace-nowrap">{e.actorRole}</td>
                <td className="px-4 py-3 whitespace-nowrap font-medium">{e.action}</td>
                <td className="px-4 py-3 whitespace-nowrap text-text-muted">
                  {e.targetType} · {e.targetId.slice(-6)}
                </td>
                <td className="px-4 py-3 text-text-muted max-w-xs truncate">{JSON.stringify(e.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {state !== 'loading' && entries.length === 0 && (
          <p className="text-sm text-text-muted text-center py-8">No matching entries.</p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="text-sm font-medium text-primary-600 disabled:text-text-muted disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-text-muted">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="text-sm font-medium text-primary-600 disabled:text-text-muted disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
