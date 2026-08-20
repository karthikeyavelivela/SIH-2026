'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useBookingSocket } from '@/lib/useBookingSocket';
import { Booking, MuthaMemberGroupInfo } from '@/lib/types';
import { OnlineToggle } from '@/components/worker/OnlineToggle';
import { StatusPill } from '@/components/worker/StatusPill';
import { ChatPanel } from '@/components/worker/ChatPanel';
import { RatingModal } from '@/components/worker/RatingModal';
import { Avatar } from '@/components/ui/Avatar';
import { MapPinIcon, TruckIcon, UsersIcon } from '@/components/ui/icons';

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

export default function MuthaMemberJobPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'online' | 'offline' | 'on_job' | null>(null);
  // The mandatory rating gate actually blocks the *leader* from re-assigning
  // this member to a new job (see bookingAssignment.service.ts), not
  // anything the member does directly — so without this, a member has no
  // way to discover they owe a rating at all until their leader hits a
  // cryptic 403 trying to assign them. Mirrors driver/hamali/mutha-leader
  // dashboards, which already prompt proactively on mount.
  const [pendingRatingId, setPendingRatingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ availabilityStatus: 'online' | 'offline' | 'on_job' }>('/api/availability')
      .then((res) => setStatus(res.availabilityStatus))
      .catch((err) => {
        if (err instanceof ApiClientError) setStatus(null);
      });
    api
      .get<{ bookingId: string | null }>('/api/ratings/pending')
      .then((res) => setPendingRatingId(res.bookingId))
      .catch(() => {});
  }, []);

  const { data } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 6000);
  const activeJob = data?.bookings.find((b) => b.status === 'accepted' || b.status === 'in_progress');
  const { messages, sendChat } = useBookingSocket(activeJob?._id);
  const { data: groupInfo } = usePolling(() => api.get<MuthaMemberGroupInfo>('/api/mutha/my-group'), 30000);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <p className="text-xs text-text-muted">Hello,</p>
      <h1 className="font-heading text-2xl font-bold mb-6">{firstName} 👋</h1>

      {status !== null && (
        <div className="mb-6">
          <OnlineToggle status={status} onStatusChange={(s) => setStatus(s)} accent="secondary" />
        </div>
      )}

      {groupInfo && (
        <div className="ip-card flex items-center gap-3 mb-6">
          <Avatar name={groupInfo.leader.name} photoUrl={groupInfo.leader.profilePhoto} accent="secondary" />
          <div className="min-w-0 flex-1">
            <p className="text-xs text-ip-on-surface-variant">{groupInfo.mutha.name} · Team leader</p>
            <p className="text-sm font-semibold truncate">{groupInfo.leader.name}</p>
          </div>
          <UsersIcon className="w-4 h-4 text-ip-on-surface-variant flex-shrink-0" />
        </div>
      )}

      {!activeJob ? (
        <div className="text-center py-16">
          <TruckIcon className="w-10 h-10 text-text-muted/50 mx-auto mb-3" />
          <p className="text-sm text-text-muted">No job assigned right now. Your Mutha leader assigns jobs to you.</p>
        </div>
      ) : (
        <>
          <RouteMap
            pickup={{ lat: activeJob.pickupLocation.coordinates[1], lng: activeJob.pickupLocation.coordinates[0] }}
            drop={{ lat: activeJob.dropLocation.coordinates[1], lng: activeJob.dropLocation.coordinates[0] }}
            className="h-48 mb-5"
          />
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-lg font-bold">Your job</h2>
            <StatusPill status={activeJob.status} />
          </div>
          <div className="space-y-2">
            <div className="flex items-start gap-2.5">
              <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-secondary-600" />
              <p className="text-sm">{activeJob.pickupLocation.address}</p>
            </div>
            <div className="flex items-start gap-2.5">
              <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-muted" />
              <p className="text-sm text-text-muted">{activeJob.dropLocation.address}</p>
            </div>
          </div>
          <p className="text-xs text-text-muted mt-4 mb-4">
            Your Mutha leader controls start/complete for this job.
          </p>
          <ChatPanel messages={messages} currentUserId={user?._id} onSend={sendChat} accent="secondary" />
        </>
      )}

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
