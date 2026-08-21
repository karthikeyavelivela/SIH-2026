'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { AlertBanner } from '@/components/ui/AlertBanner';
import { StatusChip } from '@/components/ui/StatusChip';
import { FilterChip } from '@/components/ui/FilterChip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShieldIcon } from '@/components/ui/icons';

interface FraudCaseRow {
  _id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'cleared' | 'suspended';
  notes?: string;
  createdAt: string;
  userId: { _id: string; name: string; phone: string; role: string; accountStatus: string } | null;
}

interface FraudSignal {
  _id: string;
  detectorType: string;
  severity: string;
  evidence: Record<string, unknown>;
  detectedAt: string;
}

const STATUS_FILTERS = ['', 'open', 'investigating', 'cleared', 'suspended'] as const;
const bannerTone: Record<FraudCaseRow['severity'], 'info' | 'warning' | 'danger'> = {
  low: 'info',
  medium: 'warning',
  high: 'warning',
  critical: 'danger',
};

// New page — DESIGN_INVENTORY.md security_fraud_alerts. Reads
// server/src/models/FraudCase.ts + FraudSignal.ts (new) via
// server/src/controllers/fraud.controller.ts (new). Suspending a user is a
// real, irreversible-feeling action — gated behind the same confirm-modal
// pattern as UserTable.tsx's suspend/delete actions.
export default function AdminFraudAlertsPage() {
  const [status, setStatus] = useState<string>('');
  const { data, state, reload } = usePolling(
    () => api.get<{ cases: FraudCaseRow[] }>(`/api/admin/fraud/cases${status ? `?status=${status}` : ''}`),
    15000,
    [status]
  );
  const [selected, setSelected] = useState<FraudCaseRow | null>(null);
  const [signals, setSignals] = useState<FraudSignal[]>([]);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const cases = data?.cases ?? [];

  async function openCase(c: FraudCaseRow) {
    setSelected(c);
    setConfirmSuspend(false);
    setNotes('');
    setError(null);
    if (c.status === 'open') {
      await api.patch(`/api/admin/fraud/cases/${c._id}/investigate`).catch(() => {});
    }
    const res = await api.get<{ signals: FraudSignal[] }>(`/api/admin/fraud/cases/${c._id}`);
    setSignals(res.signals);
    await reload();
  }

  async function clearCase() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/admin/fraud/cases/${selected._id}/resolve`, { resolution: 'clear', notes });
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not clear this case.');
    } finally {
      setSaving(false);
    }
  }

  async function suspendUser() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/admin/fraud/cases/${selected._id}/resolve`, { resolution: 'suspend', notes });
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not suspend this account.');
    } finally {
      setSaving(false);
    }
  }

  const resolved = selected && (selected.status === 'cleared' || selected.status === 'suspended');

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Trust & safety</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">Security & fraud alerts</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">Severity-ranked suspicious-activity case queue.</p>

      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map((s) => (
          <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
            {s === '' ? 'All' : s}
          </FilterChip>
        ))}
      </div>

      {state === 'loading' && !data && <Skeleton lines={3} className="h-16" />}

      {state !== 'loading' && cases.length === 0 && (
        <div className="ip-card max-w-2xl">
          <EmptyState icon={<ShieldIcon className="w-7 h-7" />} title="No fraud cases" description="Nothing flagged right now." />
        </div>
      )}

      <div className="space-y-3 max-w-3xl">
        {cases.map((c) => (
          <AlertBanner
            key={c._id}
            tone={bannerTone[c.severity]}
            icon={<ShieldIcon className="w-5 h-5" />}
            action={
              <button onClick={() => openCase(c)} className="text-sm font-semibold underline">
                Investigate
              </button>
            }
          >
            <p className="font-semibold capitalize">{c.severity} severity · {c.status}</p>
            <p>
              {c.userId?.name ?? 'Unknown user'} ({c.userId?.role}) · flagged {new Date(c.createdAt).toLocaleString('en-IN')}
            </p>
          </AlertBanner>
        ))}
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected ? `Case — ${selected.userId?.name ?? 'Unknown user'}` : 'Case'}>
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <StatusChip tone="secondary">{selected.userId?.role}</StatusChip>
              <StatusChip tone={selected.userId?.accountStatus === 'suspended' ? 'danger' : 'success'}>
                {selected.userId?.accountStatus}
              </StatusChip>
            </div>
            <p className="text-sm text-ip-on-surface-variant">{selected.userId?.phone}</p>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">Evidence</p>
              <div className="space-y-2">
                {signals.map((s) => (
                  <div key={s._id} className="rounded-ip-input border border-ip-outline/15 p-3">
                    <p className="text-sm font-semibold capitalize">{s.detectorType.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-ip-on-surface-variant mb-1">{new Date(s.detectedAt).toLocaleString('en-IN')}</p>
                    <pre className="text-xs text-ip-on-surface-variant whitespace-pre-wrap break-all">{JSON.stringify(s.evidence, null, 2)}</pre>
                  </div>
                ))}
                {signals.length === 0 && <p className="text-sm text-ip-on-surface-variant">No signal evidence recorded.</p>}
              </div>
            </div>

            {!resolved && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-3.5 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
                />
              </div>
            )}

            {error && <p className="text-sm text-ip-error">{error}</p>}

            {!resolved && !confirmSuspend && (
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" disabled={saving} onClick={clearCase}>
                  Clear (false positive)
                </Button>
                <Button variant="danger" className="flex-1" disabled={saving} onClick={() => setConfirmSuspend(true)}>
                  Suspend account
                </Button>
              </div>
            )}

            {confirmSuspend && (
              <div className="rounded-ip-input border border-ip-error/40 bg-ip-error-container/40 p-4">
                <p className="text-sm text-ip-on-error-container mb-3 font-medium">
                  This immediately suspends {selected.userId?.name ?? 'this account'}. They will not be able to use
                  FYRO until an admin reinstates them. Confirm?
                </p>
                <div className="flex gap-3">
                  <Button variant="ghost" className="flex-1" disabled={saving} onClick={() => setConfirmSuspend(false)}>
                    Cancel
                  </Button>
                  <Button variant="danger" className="flex-1" disabled={saving} onClick={suspendUser}>
                    {saving ? 'Suspending…' : 'Confirm suspend'}
                  </Button>
                </div>
              </div>
            )}

            {resolved && <p className="text-sm text-ip-on-surface-variant">This case is already resolved ({selected.status}).</p>}
          </div>
        )}
      </Modal>
    </div>
  );
}
