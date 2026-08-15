'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Complaint } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const statusTone: Record<Complaint['status'], 'muted' | 'secondary' | 'success'> = {
  open: 'muted',
  in_review: 'secondary',
  resolved: 'success',
};

export default function AdminComplaintsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const { data, reload } = usePolling(
    () => api.get<{ complaints: Complaint[] }>(`/api/admin/complaints${statusFilter ? `?status=${statusFilter}` : ''}`),
    15000,
    [statusFilter]
  );
  const [resolving, setResolving] = useState<Complaint | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submitResolution(status: 'in_review' | 'resolved') {
    if (!resolving) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/api/admin/complaints/${resolving._id}/resolve`, { status, resolutionNote: note });
      setResolving(null);
      setNote('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not update this complaint.');
    } finally {
      setSaving(false);
    }
  }

  const complaints = data?.complaints ?? [];

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600 mb-2">Trust & safety</p>
      <h1 className="font-heading text-2xl font-bold mb-1">Complaints</h1>
      <p className="text-sm text-text-muted mb-6">Resolution queue for issues raised against a booking.</p>

      <div className="flex gap-2 mb-6">
        {['', 'open', 'in_review', 'resolved'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3.5 py-2 rounded-full text-sm font-medium border transition-colors duration-fast ${
              statusFilter === s ? 'bg-primary-600 text-white border-primary-600' : 'border-border hover:bg-surface'
            }`}
          >
            {s === '' ? 'All' : s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        {complaints.map((c) => (
          <Card key={c._id} elevation="raised">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold capitalize">{c.category.replace('_', ' ')}</p>
              <Badge tone={statusTone[c.status]}>{c.status.replace('_', ' ')}</Badge>
            </div>
            <p className="text-sm text-text-muted mb-3">{c.description}</p>
            {c.status !== 'resolved' && (
              <Button
                size="md"
                variant="ghost"
                onClick={() => {
                  setResolving(c);
                  setNote('');
                  setError(null);
                }}
              >
                Review
              </Button>
            )}
            {c.resolutionNote && <p className="text-xs text-text-muted mt-2 pt-2 border-t border-border">{c.resolutionNote}</p>}
          </Card>
        ))}
        {complaints.length === 0 && <p className="text-sm text-text-muted">No complaints here.</p>}
      </div>

      <Modal open={!!resolving} onClose={() => setResolving(null)} title="Resolve complaint">
        <p className="text-sm text-text-muted mb-4">{resolving?.description}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Resolution note"
          rows={4}
          aria-label="Resolution note"
          className="w-full px-4 py-2.5 rounded-md border border-border bg-background text-sm mb-4 focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
        />
        {error && <p className="text-sm text-red-700 mb-4">{error}</p>}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" disabled={saving || !note.trim()} onClick={() => submitResolution('in_review')}>
            Mark in review
          </Button>
          <Button className="flex-1" disabled={saving || !note.trim()} onClick={() => submitResolution('resolved')}>
            Resolve
          </Button>
        </div>
      </Modal>
    </div>
  );
}
