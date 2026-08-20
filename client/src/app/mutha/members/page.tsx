'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MuthaResponse } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Avatar } from '@/components/ui/Avatar';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { UsersIcon, ChevronRightIcon } from '@/components/ui/icons';

export default function MuthaMembersPage() {
  const { data, reload } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);
  const [toRemove, setToRemove] = useState<{ _id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirmRemove() {
    if (!toRemove) return;
    setPending(true);
    setError(null);
    try {
      await api.delete(`/api/mutha/members/${toRemove._id}`);
      setToRemove(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not remove this member.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="font-heading text-2xl font-bold">Members</h1>
        <Link href="/mutha/create-group" className="inline-flex items-center gap-1 text-xs font-semibold text-ip-secondary hover:underline flex-shrink-0 mt-1.5">
          Group settings
          <ChevronRightIcon className="w-3.5 h-3.5" />
        </Link>
      </div>
      <p className="text-sm text-ip-on-surface-variant mb-4">
        New members join themselves from the sign-up screen using your invite code.
      </p>

      {data && (
        <div className="ip-card mb-6 text-center">
          <p className="text-xs text-ip-on-surface-variant mb-1">Your invite code</p>
          <p className="font-heading text-2xl font-bold tracking-[0.2em] text-ip-secondary">{data.mutha.inviteCode}</p>
        </div>
      )}

      {data?.members.length === 0 && (
        <div className="ip-card">
          <EmptyState icon={<UsersIcon className="w-6 h-6" />} title="No members yet" description="Share the invite code above." />
        </div>
      )}

      <div className="space-y-3">
        {data?.members.map((m) => (
          <div key={m._id} className="ip-card flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar name={m.name} photoUrl={m.profilePhoto} accent="secondary" status={m.availabilityStatus} />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{m.name}</p>
                <p className="text-xs text-ip-on-surface-variant">{m.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <StatusChip tone={m.availabilityStatus === 'online' ? 'success' : 'muted'}>
                {m.availabilityStatus.replace('_', ' ')}
              </StatusChip>
              <button
                type="button"
                onClick={() => setToRemove({ _id: m._id, name: m.name })}
                className="text-xs font-semibold text-ip-error hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!toRemove} onClose={() => setToRemove(null)} title="Remove member?">
        <p className="text-sm text-text-muted mb-5">
          {toRemove?.name} will no longer be matched to jobs through your group. Their account isn't deleted.
        </p>
        {error && (
          <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setToRemove(null)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={confirmRemove} disabled={pending}>
            {pending ? 'Removing…' : 'Remove'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
