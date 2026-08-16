'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { MuthaResponse } from '@/lib/types';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { RatingModal } from '@/components/worker/RatingModal';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { StarIcon, UsersIcon, ChevronRightIcon } from '@/components/ui/icons';

const dotColor: Record<string, string> = {
  online: 'bg-emerald-500',
  on_job: 'bg-secondary-600',
  offline: 'bg-text-muted/40',
};

export default function MuthaDashboardPage() {
  const { user } = useAuth();
  const { data, state } = usePolling(() => api.get<MuthaResponse>('/api/mutha/me'), 15000);
  const [pendingRatingId, setPendingRatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => {});
  }, []);

  const onlineCount = data?.members.filter((m) => m.availabilityStatus === 'online').length ?? 0;
  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <p className="text-xs text-text-muted">Hello,</p>
      <h1 className="font-heading text-2xl font-bold mb-6">{firstName} 👋</h1>

      <NotificationPrompt accent="secondary" copy="Get notified the instant a new job request arrives." />

      {state === 'loading' && <div className="h-32 rounded-lg bg-surface animate-pulse mb-6" />}

      {data && (
        <div className="rounded-lg bg-secondary-600 text-white p-6 shadow-lg mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="font-heading text-xl font-bold">{data.mutha.name}</p>
            <span className="inline-flex items-center gap-1 text-sm font-semibold bg-white/15 px-2.5 py-1 rounded-full">
              <StarIcon className="w-3.5 h-3.5" />
              {data.mutha.ratingCount > 0 ? data.mutha.ratingAvg.toFixed(1) : 'New'}
            </span>
          </div>
          <div className="flex items-center gap-6 text-sm text-white/85">
            <p>
              <span className="font-heading font-bold text-white text-lg">{data.members.length}</span> members
            </p>
            <p>
              <span className="font-heading font-bold text-white text-lg">{onlineCount}</span> online
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-white/20">
            <p className="text-xs text-white/70 mb-1">Invite code — share to add members</p>
            <p className="font-heading text-lg font-bold tracking-[0.15em]">{data.mutha.inviteCode}</p>
          </div>
        </div>
      )}

      <h2 className="font-heading text-lg font-bold mb-3">Members</h2>
      <div className="space-y-2 mb-6">
        {data?.members.length === 0 && (
          <Card elevation="raised" className="text-center py-8">
            <UsersIcon className="w-8 h-8 text-text-muted/50 mx-auto mb-3" />
            <p className="text-sm text-text-muted">No members yet. Share your invite code above.</p>
          </Card>
        )}
        {data?.members.map((m) => (
          <div key={m._id} className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-raised border border-border shadow-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor[m.availabilityStatus]}`} />
              <p className="text-sm font-medium truncate">{m.name}</p>
            </div>
            <Badge tone={m.availabilityStatus === 'online' ? 'success' : 'muted'}>
              {m.availabilityStatus.replace('_', ' ')}
            </Badge>
          </div>
        ))}
      </div>

      <Link
        href="/mutha/requests"
        className="flex items-center justify-between p-4 rounded-lg bg-surface-raised border border-border shadow-sm hover:shadow-md transition-all duration-base"
      >
        <p className="text-sm font-semibold">View open job requests</p>
        <ChevronRightIcon className="w-4 h-4 text-text-muted" />
      </Link>

      {pendingRatingId && (
        <RatingModal
          bookingId={pendingRatingId}
          open
          accent="secondary"
          title="Rate your last customer"
          onDone={() => setPendingRatingId(null)}
        />
      )}
    </div>
  );
}
