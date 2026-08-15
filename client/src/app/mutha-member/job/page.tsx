'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { usePolling } from '@/lib/usePolling';
import { useBookingSocket } from '@/lib/useBookingSocket';
import { Booking } from '@/lib/types';
import { OnlineToggle } from '@/components/worker/OnlineToggle';
import { StatusPill } from '@/components/worker/StatusPill';
import { ChatPanel } from '@/components/worker/ChatPanel';
import { MapPinIcon, TruckIcon } from '@/components/ui/icons';

const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

export default function MuthaMemberJobPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<'online' | 'offline' | 'on_job' | null>(null);

  useEffect(() => {
    api
      .get<{ availabilityStatus: 'online' | 'offline' | 'on_job' }>('/api/availability')
      .then((res) => setStatus(res.availabilityStatus))
      .catch((err) => {
        if (err instanceof ApiClientError) setStatus(null);
      });
  }, []);

  const { data } = usePolling(() => api.get<{ bookings: Booking[] }>('/api/requests/mine'), 6000);
  const activeJob = data?.bookings.find((b) => b.status === 'accepted' || b.status === 'in_progress');
  const { messages, sendChat } = useBookingSocket(activeJob?._id);

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
    </div>
  );
}
