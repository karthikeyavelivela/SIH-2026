'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { Complaint } from '@/lib/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StatusChip } from '@/components/ui/StatusChip';
import { FilterChip } from '@/components/ui/FilterChip';

const statusTone: Record<Complaint['status'], 'muted' | 'secondary' | 'success'> = {
  open: 'muted',
  in_review: 'secondary',
  resolved: 'success',
};

// Restyled onto the ip-* tonal system per DESIGN_INVENTORY.md — all
// fetch/mutation logic identical to before this pass.
export default function AdminComplaintsPage() {
  const t = useTranslations('adminComplaints');
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
      setError(err instanceof ApiClientError ? err.message : t('errorUpdate'));
    } finally {
      setSaving(false);
    }
  }

  const complaints = data?.complaints ?? [];

  return (
    <div className="animate-[fadeUp_400ms_ease-out]">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-ip-primary mb-2">{t('eyebrow')}</p>
      <h1 className="font-heading text-ip-display-md font-extrabold mb-1">{t('title')}</h1>
      <p className="text-sm text-ip-on-surface-variant mb-6">{t('subtitle')}</p>

      <div className="flex flex-wrap gap-2 mb-6">
        {(['', 'open', 'in_review', 'resolved'] as const).map((s) => (
          <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
            {s === '' ? t('all') : t(`status.${s}`)}
          </FilterChip>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4 max-w-4xl">
        {complaints.map((c) => (
          <div key={c._id} className="ip-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold capitalize">{t(`category.${c.category}`)}</p>
              <StatusChip tone={statusTone[c.status]}>{t(`status.${c.status}`)}</StatusChip>
            </div>
            <p className="text-sm text-ip-on-surface-variant mb-3">{c.description}</p>
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
                {t('review')}
              </Button>
            )}
            {c.resolutionNote && (
              <p className="text-xs text-ip-on-surface-variant mt-2 pt-2 border-t border-ip-outline/10">
                {c.resolutionNote}
              </p>
            )}
          </div>
        ))}
        {complaints.length === 0 && <p className="text-sm text-ip-on-surface-variant">{t('noComplaints')}</p>}
      </div>

      <Modal open={!!resolving} onClose={() => setResolving(null)} title={t('resolveTitle')}>
        <p className="text-sm text-ip-on-surface-variant mb-4">{resolving?.description}</p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('notePlaceholder')}
          rows={4}
          aria-label={t('noteAria')}
          className="w-full px-4 py-2.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm mb-4 focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20"
        />
        {error && <p className="text-sm text-ip-error mb-4">{error}</p>}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" disabled={saving || !note.trim()} onClick={() => submitResolution('in_review')}>
            {t('markInReview')}
          </Button>
          <Button className="flex-1" disabled={saving || !note.trim()} onClick={() => submitResolution('resolved')}>
            {t('resolve')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
