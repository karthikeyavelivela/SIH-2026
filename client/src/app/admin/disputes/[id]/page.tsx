'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useParams, useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { StatusChip } from '@/components/ui/StatusChip';
import { Timeline } from '@/components/ui/Timeline';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { AgentResultCard, type AgentResult } from '@/components/ui/AgentResultCard';

interface DisputeDetail {
  _id: string;
  claim: string;
  status: 'open' | 'investigating' | 'resolved' | 'escalated';
  priority: 'low' | 'medium' | 'high' | 'critical';
  createdAt: string;
  raisedBy: { name: string; phone: string; role: string } | null;
  bookingId: string;
  systemRecord: {
    status: string;
    fareTotal: number;
    distanceKm: number;
    pickupAddress: string;
    dropAddress: string;
    statusHistory: { status: string; timestamp: string }[];
  };
  communicationLog: { from: string; message: string; at: string }[];
  resolution?: { action: string; note: string; amount?: number; resolvedAt: string };
}

const statusTone: Record<DisputeDetail['status'], 'muted' | 'secondary' | 'success' | 'danger'> = {
  open: 'muted',
  investigating: 'secondary',
  resolved: 'success',
  escalated: 'danger',
};

const ACTIONS = [
  { value: 'approve_adjustment', label: 'Approve fare adjustment' },
  { value: 'partial_refund', label: 'Partial refund' },
  { value: 'reject', label: 'Reject claim' },
  { value: 'escalate', label: 'Escalate' },
] as const;

// New page — DESIGN_INVENTORY.md dispute_refund_resolution detail half:
// side-by-side claim vs system record, using Timeline for the
// communication log. Resolve action does NOT trigger a real Razorpay
// refund (later phase) — it only records the decision + audit log, per
// the build spec.
export default function AdminDisputeDetailPage() {
  const t = useTranslations('agents.disputeTriage');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, state, reload } = usePolling(() => api.get<{ dispute: DisputeDetail }>(`/api/admin/disputes/${id}`), 15000);
  const dispute = data?.dispute;

  const [action, setAction] = useState<(typeof ACTIONS)[number]['value']>('approve_adjustment');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [triage, setTriage] = useState<AgentResult | null>(null);
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);

  async function runTriage() {
    setTriageLoading(true);
    setTriageError(null);
    try {
      const res = await api.post<{ result: AgentResult }>(`/api/agents/dispute-triage/${id}`);
      setTriage(res.result);
    } catch (err) {
      setTriageError(err instanceof ApiClientError ? err.message : t('error'));
    } finally {
      setTriageLoading(false);
    }
  }

  async function resolve() {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/admin/disputes/${id}/resolve`, {
        action,
        note: note.trim(),
        amount: amount ? Number(amount) : undefined,
      });
      setNote('');
      setAmount('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not resolve this dispute.');
    } finally {
      setSaving(false);
    }
  }

  async function sendMessage() {
    if (!message.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/admin/disputes/${id}/messages`, { message: message.trim() });
      setMessage('');
      await reload();
    } finally {
      setSaving(false);
    }
  }

  if (state === 'loading' && !dispute) {
    return (
      <div className="max-w-4xl">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  if (!dispute) return null;

  const resolved = dispute.status === 'resolved' || dispute.status === 'escalated';

  return (
    <div className="max-w-4xl animate-[fadeUp_400ms_ease-out]">
      <button
        onClick={() => router.push('/admin/disputes')}
        className="flex items-center gap-1 text-sm text-ip-on-surface-variant hover:text-ip-on-surface mb-4"
      >
        <ChevronLeftIcon className="w-4 h-4" /> Back to queue
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Dispute #{dispute._id.slice(-6)}</p>
          <h1 className="font-heading text-ip-headline-sm font-bold mb-1">{dispute.claim}</h1>
          <p className="text-sm text-ip-on-surface-variant">
            Raised by {dispute.raisedBy?.name ?? 'Unknown'} ({dispute.raisedBy?.role}) ·{' '}
            {new Date(dispute.createdAt).toLocaleString('en-IN')}
          </p>
        </div>
        <StatusChip tone={statusTone[dispute.status]}>{dispute.status}</StatusChip>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="ip-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">Customer claim</p>
          <p className="text-sm text-ip-on-surface">{dispute.claim}</p>
        </div>
        <div className="ip-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">System record</p>
          <dl className="text-sm space-y-1.5">
            <div className="flex justify-between"><dt className="text-ip-on-surface-variant">Booking status</dt><dd className="font-medium capitalize">{dispute.systemRecord.status}</dd></div>
            <div className="flex justify-between"><dt className="text-ip-on-surface-variant">Fare total</dt><dd className="font-medium">₹{dispute.systemRecord.fareTotal}</dd></div>
            <div className="flex justify-between"><dt className="text-ip-on-surface-variant">Distance</dt><dd className="font-medium">{dispute.systemRecord.distanceKm} km</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ip-on-surface-variant flex-shrink-0">Pickup</dt><dd className="font-medium text-right truncate">{dispute.systemRecord.pickupAddress}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-ip-on-surface-variant flex-shrink-0">Drop</dt><dd className="font-medium text-right truncate">{dispute.systemRecord.dropAddress}</dd></div>
          </dl>
        </div>
      </div>

      <div className="mb-8">
        {triage ? (
          <AgentResultCard result={triage} />
        ) : (
          <div className="ip-card">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ip-on-surface">{t('title')}</p>
                <p className="text-xs text-ip-on-surface-variant mt-0.5">{t('subtitle')}</p>
              </div>
              <Button variant="ghost" disabled={triageLoading} onClick={runTriage}>
                {triageLoading ? t('analysing') : t('run')}
              </Button>
            </div>
            {triageError && <p className="text-sm text-ip-error mt-2">{triageError}</p>}
          </div>
        )}
      </div>

      <div className="ip-card mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-3">Communication log</p>
        {dispute.communicationLog.length === 0 ? (
          <p className="text-sm text-ip-on-surface-variant">No messages yet.</p>
        ) : (
          <Timeline
            events={dispute.communicationLog.map((m, i) => ({
              id: String(i),
              label: `${m.from}: ${m.message}`,
              timestamp: new Date(m.at).toLocaleString('en-IN'),
            }))}
          />
        )}
        {!resolved && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-ip-outline/10">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Add a note to the log…"
              className="flex-1 min-h-[44px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20"
            />
            <Button variant="ghost" disabled={saving || !message.trim()} onClick={sendMessage}>
              Add
            </Button>
          </div>
        )}
      </div>

      {resolved && dispute.resolution ? (
        <div className="ip-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">Resolution</p>
          <p className="text-sm text-ip-on-surface capitalize">{dispute.resolution.action.replace('_', ' ')}</p>
          <p className="text-sm text-ip-on-surface-variant mt-1">{dispute.resolution.note}</p>
          {dispute.resolution.amount !== undefined && (
            <p className="text-sm font-semibold mt-1">Amount: ₹{dispute.resolution.amount}</p>
          )}
        </div>
      ) : (
        <div className="ip-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-3">Resolve</p>
          <div className="space-y-3">
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as typeof action)}
              className="w-full min-h-[44px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            {(action === 'approve_adjustment' || action === 'partial_refund') && (
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount (₹)"
                className="w-full min-h-[44px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
              />
            )}
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Resolution note (required)"
              className="w-full px-3.5 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
            />
            {error && <p className="text-sm text-ip-error">{error}</p>}
            <Button disabled={saving || !note.trim()} onClick={resolve} className="w-full">
              {saving ? 'Saving…' : 'Record resolution'}
            </Button>
            <p className="text-xs text-ip-on-surface-variant">
              This records the decision and writes an audit-log entry. It does not trigger a real payment refund.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
