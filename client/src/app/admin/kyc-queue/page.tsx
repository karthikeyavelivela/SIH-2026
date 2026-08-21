'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { QueueCounter } from '@/components/ui/QueueCounter';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ShieldIcon } from '@/components/ui/icons';

interface KycDocument {
  _id: string;
  type: string;
  url: string;
  status: 'under_review' | 'verified' | 'rejected';
  rejectionReason?: string;
  uploadedAt: string;
}

interface KycUser {
  _id: string;
  name: string;
  phone: string;
  role: string;
  region?: string;
  kycDocs: KycDocument[];
  createdAt: string;
}

const DOC_TYPE_LABEL: Record<string, string> = {
  driving_licence: 'Driving Licence',
  vehicle_rc: 'Vehicle RC',
  fastag: 'FASTag',
  goods_carriage_permit: 'Goods Carriage Permit',
  puc: 'PUC Certificate',
  vehicle_fitness: 'Vehicle Fitness Certificate',
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  gstin: 'GSTIN',
};

const docStatusTone: Record<KycDocument['status'], 'muted' | 'secondary' | 'success' | 'danger'> = {
  under_review: 'secondary',
  verified: 'success',
  rejected: 'danger',
};
const docStatusLabel: Record<KycDocument['status'], string> = {
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
};

// New page — DESIGN_INVENTORY.md kyc_verification_queue_1/_2, consolidated
// into one list+detail view per the build spec. Approve/reject PATCH
// server/src/controllers/kyc.controller.ts (new), gated on the existing
// 'verify_kyc' MANAGER_PERMISSIONS slot, audit-logged server-side.
export default function AdminKycQueuePage() {
  const { data, state, reload } = usePolling(() => api.get<{ users: KycUser[] }>('/api/admin/kyc-queue'), 15000);
  const [selected, setSelected] = useState<KycUser | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const users = data?.users ?? [];

  function openDetail(u: KycUser) {
    setSelected(u);
    setRejecting(false);
    setReason('');
    setError(null);
  }

  async function approve() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/admin/kyc-queue/${selected._id}`, { status: 'verified' });
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not approve this submission.');
    } finally {
      setSaving(false);
    }
  }

  async function reject() {
    if (!selected || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/admin/kyc-queue/${selected._id}`, { status: 'rejected', rejectionReason: reason.trim() });
      setSelected(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not reject this submission.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">Trust & safety</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">KYC verification queue</h1>
      <p className="text-sm text-ip-on-surface-variant mb-7">
        Review and approve or reject pending identity/document submissions.
      </p>

      <div className="max-w-xs mb-8">
        <QueueCounter count={users.length} label="Pending review" tone={users.length > 0 ? 'primary' : 'muted'} />
      </div>

      {state === 'loading' && !data && <Skeleton lines={4} className="h-16" />}

      {state !== 'loading' && users.length === 0 && (
        <div className="ip-card max-w-2xl">
          <EmptyState icon={<ShieldIcon className="w-7 h-7" />} title="Queue is empty" description="No pending KYC submissions right now." />
        </div>
      )}

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-6xl">
        {users.map((u) => (
          <button
            key={u._id}
            type="button"
            onClick={() => openDetail(u)}
            className="ip-card text-left hover:bg-ip-surface-container-high transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="font-heading font-semibold">{u.name}</p>
              <StatusChip tone="secondary">{u.role.replace('_', ' ')}</StatusChip>
            </div>
            <p className="text-sm text-ip-on-surface-variant mb-2">{u.phone}{u.region ? ` · ${u.region}` : ''}</p>
            <p className="text-xs text-ip-outline">
              {u.kycDocs.length} document{u.kycDocs.length === 1 ? '' : 's'} submitted
            </p>
          </button>
        ))}
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Review — ${selected.name}` : 'Review submission'}
      >
        {selected && (
          <div className="space-y-4">
            <div className="text-sm text-ip-on-surface-variant">
              <p>{selected.phone}</p>
              <p className="capitalize">{selected.role.replace('_', ' ')}{selected.region ? ` · ${selected.region}` : ''}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-2">
                Submitted documents
              </p>
              {selected.kycDocs.length === 0 && <p className="text-sm text-ip-on-surface-variant">No documents on file.</p>}
              <div className="space-y-2">
                {selected.kycDocs.map((doc) => (
                  <a
                    key={doc._id}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-ip-input border border-ip-outline/20 text-sm hover:bg-ip-surface-container"
                  >
                    <span className="text-ip-primary truncate">{DOC_TYPE_LABEL[doc.type] ?? doc.type}</span>
                    <StatusChip tone={docStatusTone[doc.status]}>{docStatusLabel[doc.status]}</StatusChip>
                  </a>
                ))}
              </div>
            </div>

            {rejecting && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-1.5">
                  Rejection reason
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder="e.g. Photo is blurry, document expired…"
                  className="w-full px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20"
                />
              </div>
            )}

            {error && <p className="text-sm text-ip-error">{error}</p>}

            <div className="flex gap-3 pt-2">
              {!rejecting ? (
                <>
                  <Button variant="danger" className="flex-1" disabled={saving} onClick={() => setRejecting(true)}>
                    Reject
                  </Button>
                  <Button className="flex-1" disabled={saving} onClick={approve}>
                    {saving ? 'Approving…' : 'Approve'}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" className="flex-1" disabled={saving} onClick={() => setRejecting(false)}>
                    Back
                  </Button>
                  <Button variant="danger" className="flex-1" disabled={saving || !reason.trim()} onClick={reject}>
                    {saving ? 'Rejecting…' : 'Confirm reject'}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
