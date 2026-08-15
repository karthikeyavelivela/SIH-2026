'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MuthaResponse } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { UsersIcon } from '@/components/ui/icons';

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
      <h1 className="font-heading text-2xl font-bold mb-1">Members</h1>
      <p className="text-sm text-text-muted mb-4">
        New members join themselves from the sign-up screen using your invite code.
      </p>

      {data && (
        <Card elevation="raised" className="mb-6 text-center">
          <p className="text-xs text-text-muted mb-1">Your invite code</p>
          <p className="font-heading text-2xl font-bold tracking-[0.2em] text-secondary-600">{data.mutha.inviteCode}</p>
        </Card>
      )}

      {data?.members.length === 0 && (
        <Card elevation="raised" className="text-center py-10">
          <UsersIcon className="w-8 h-8 text-text-muted/50 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No members yet. Share the invite code above.</p>
        </Card>
      )}

      <div className="space-y-3">
        {data?.members.map((m) => (
          <Card key={m._id} elevation="raised" className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{m.name}</p>
              <p className="text-xs text-text-muted">{m.phone}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge tone={m.availabilityStatus === 'online' ? 'success' : 'muted'}>
                {m.availabilityStatus.replace('_', ' ')}
              </Badge>
              <button
                type="button"
                onClick={() => setToRemove({ _id: m._id, name: m.name })}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          </Card>
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
