'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { useNotificationPermission } from '@/lib/useNotificationPermission';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { StatusChip } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ListDivider } from '@/components/ui/ListDivider';
import {
  BellIcon,
  MapPinIcon,
  TruckIcon,
  BoxIcon,
  LayersIcon,
  ClockIcon,
  ChevronRightIcon,
} from '@/components/ui/icons';

interface BookingSummary {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  fareBreakdown: { total: number };
  pickupLocation: { address: string };
  dropLocation: { address: string };
  createdAt: string;
}

const quickActions = [
  { href: '/customer/book?type=hamali', label: 'Hamali Labor', hint: 'Hire loaders', icon: BoxIcon },
  { href: '/customer/history', label: 'History', hint: 'View past trips', icon: ClockIcon },
];

const statusLabel: Record<string, string> = {
  requested: 'Requested',
  searching: 'Finding a match…',
  matched: 'Matched',
  accepted: 'Accepted',
  in_progress: 'In Transit',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusTone: Record<string, 'muted' | 'secondary' | 'primary' | 'success' | 'danger'> = {
  requested: 'muted',
  searching: 'muted',
  matched: 'secondary',
  accepted: 'secondary',
  in_progress: 'primary',
  completed: 'success',
  cancelled: 'danger',
};

const PROGRESS_STEPS = ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed'];

function shortAddress(address: string): string {
  return address.split(',')[0];
}

export default function CustomerDashboardPage() {
  const { user } = useAuth();
  const { permission, request } = useNotificationPermission();
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    async function load() {
      try {
        const res = await api.get<{ bookings: BookingSummary[] }>('/api/bookings');
        setBookings(res.bookings);
        setLoadState('ready');
      } catch (err) {
        // Booking history isn't wired up yet in every environment this runs
        // in (Phase 2 backend) — degrade to an empty/CTA state rather than
        // a broken page instead of assuming the endpoint always exists.
        if (err instanceof ApiClientError) setLoadState('unavailable');
        else setLoadState('unavailable');
      }
    }
    load();
  }, []);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  const activeBooking = bookings.find((b) => !['completed', 'cancelled'].includes(b.status));
  const recent = bookings.filter((b) => b._id !== activeBooking?._id).slice(0, 5);
  const activeStepIndex = activeBooking ? PROGRESS_STEPS.indexOf(activeBooking.status) : -1;
  const progressPct = activeStepIndex >= 0 ? Math.round((activeStepIndex / (PROGRESS_STEPS.length - 1)) * 100) : 0;

  return (
    <div className="min-h-screen bg-ip-surface">
      {/* TopAppBar */}
      <header className="w-full sticky top-0 z-30 bg-ip-surface-container/95 backdrop-blur-sm flex justify-between items-center px-ip-edge py-3 max-w-[600px] mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-full bg-ip-surface-container-lowest overflow-hidden flex-shrink-0 flex items-center justify-center text-ip-primary font-heading font-bold"
            aria-hidden="true"
          >
            {user?.profilePhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.profilePhoto} alt="" className="w-full h-full object-cover" />
            ) : (
              (user?.name ?? '?')[0]?.toUpperCase()
            )}
          </div>
          <h1 className="font-heading font-extrabold text-ip-headline-sm text-ip-primary tracking-tight uppercase truncate">FYRO</h1>
        </div>
        <button
          type="button"
          aria-label={permission === 'granted' ? 'Alerts on' : 'Enable alerts'}
          onClick={() => permission === 'default' && request()}
          className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${
            permission === 'granted' ? 'bg-ip-primary-container/25 text-ip-primary' : 'text-ip-on-surface-variant hover:bg-ip-surface-container-high'
          }`}
        >
          <BellIcon className="w-5 h-5" />
        </button>
      </header>

      <main className="max-w-[600px] mx-auto px-ip-edge pt-ip-lg pb-ip-xl flex flex-col gap-ip-xl">
        <NotificationPrompt accent="primary" copy="Get notified the instant a driver or Hamali is on the way." />

        {/* Welcome */}
        <section className="flex flex-col gap-ip-sm">
          <p className="text-ip-body-lg text-ip-on-surface-variant">Welcome back,</p>
          <h2 className="font-heading font-extrabold text-ip-display-lg text-ip-on-surface leading-none">{firstName}</h2>
        </section>

        {/* Quick Action Bento */}
        <section className="grid grid-cols-2 gap-ip-sm">
          <Link
            href="/customer/book"
            className="ip-card active:bg-ip-surface-container-high active:border active:border-ip-on-surface col-span-2 relative overflow-hidden flex flex-col items-start gap-ip-md"
          >
            <div className="w-12 h-12 rounded-full bg-ip-primary-container text-ip-on-primary flex items-center justify-center z-10">
              <TruckIcon className="w-6 h-6" />
            </div>
            <div className="flex flex-col items-start z-10">
              <span className="font-heading font-bold text-lg text-ip-on-surface">Book a Truck</span>
              <span className="text-ip-body-sm text-ip-on-surface-variant">Instant logistics support</span>
            </div>
            <TruckIcon className="pointer-events-none select-none absolute -right-3 -bottom-4 w-28 h-28 opacity-10" />
          </Link>

          {quickActions.map((qa) => (
            <Link
              key={qa.href}
              href={qa.href}
              className="ip-card active:bg-ip-surface-container-high active:border active:border-ip-on-surface flex flex-col items-start gap-ip-md"
            >
              <div className="w-10 h-10 rounded-full bg-ip-surface-container-highest text-ip-primary flex items-center justify-center">
                <qa.icon className="w-5 h-5" />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-semibold text-ip-on-surface">{qa.label}</span>
                <span className="text-ip-body-sm text-ip-on-surface-variant">{qa.hint}</span>
              </div>
            </Link>
          ))}
        </section>

        {/* Active Tracking */}
        {activeBooking && (
          <section className="flex flex-col gap-ip-md">
            <h3 className="font-heading font-bold text-ip-headline-sm text-ip-on-surface border-b border-ip-outline/10 pb-ip-xs">
              Active Tracking
            </h3>
            <Link href={`/customer/track/${activeBooking._id}`} className="ip-card active:bg-ip-surface-container-high flex flex-col gap-ip-md">
              <div className="flex justify-between items-start gap-3">
                <div className="flex flex-col gap-1">
                  <StatusChip tone={statusTone[activeBooking.status] ?? 'muted'} dot>
                    {statusLabel[activeBooking.status] ?? activeBooking.status}
                  </StatusChip>
                  <span className="font-heading font-semibold text-ip-data-mono text-ip-on-surface tabular-nums">
                    ₹{activeBooking.fareBreakdown.total}
                  </span>
                </div>
                <span className="text-xs text-ip-on-surface-variant text-right">
                  {new Date(activeBooking.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </div>
              <div className="flex items-center gap-ip-sm">
                <div className="w-8 h-8 rounded-full bg-ip-surface-container-highest flex items-center justify-center text-ip-on-surface-variant flex-shrink-0">
                  <MapPinIcon className="w-4 h-4" />
                </div>
                <div className="h-px flex-1 bg-ip-outline/20 relative">
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-ip-primary rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="w-8 h-8 rounded-full bg-ip-surface-container-highest flex items-center justify-center text-ip-on-surface-variant flex-shrink-0">
                  <MapPinIcon className="w-4 h-4" />
                </div>
              </div>
              <div className="flex justify-between text-ip-body-sm text-ip-on-surface-variant gap-3">
                <span className="truncate">{shortAddress(activeBooking.pickupLocation.address)}</span>
                <span className="truncate text-right">{shortAddress(activeBooking.dropLocation.address)}</span>
              </div>
            </Link>
          </section>
        )}

        {/* Recent bookings */}
        <section className="flex flex-col gap-ip-md">
          <div className="flex items-center justify-between border-b border-ip-outline/10 pb-ip-xs">
            <h3 className="font-heading font-bold text-ip-headline-sm text-ip-on-surface">Recent bookings</h3>
            <Link href="/customer/history" className="text-sm font-semibold text-ip-primary hover:underline">
              See all
            </Link>
          </div>

          {loadState === 'loading' && <Skeleton lines={3} className="h-16" />}

          {loadState !== 'loading' && bookings.length === 0 && (
            <div className="ip-card">
              <EmptyState
                icon={<LayersIcon className="w-6 h-6" />}
                title="No bookings yet"
                description="Book your first truck or Hamali crew to see it here."
                action={
                  <Link href="/customer/book" className="text-sm font-semibold text-ip-primary hover:underline">
                    Book your first delivery →
                  </Link>
                }
              />
            </div>
          )}

          {loadState !== 'loading' && bookings.length > 0 && recent.length === 0 && (
            <p className="text-center py-6 text-ip-body-sm text-ip-on-surface-variant">
              Nothing else yet — your active shipment above is the only one so far.
            </p>
          )}

          {recent.length > 0 && (
            <div className="flex flex-col">
              {recent.map((b, i) => (
                <div key={b._id}>
                  <Link href={`/customer/track/${b._id}`} className="flex items-center justify-between py-ip-sm active:bg-ip-surface-container-high group -mx-2 px-2 rounded-ip-input transition-colors">
                    <div className="flex items-center gap-ip-sm min-w-0">
                      <div className="w-10 h-10 rounded-full bg-ip-surface-container-highest group-hover:bg-ip-primary-container group-hover:text-ip-on-primary transition-colors flex items-center justify-center text-ip-on-surface-variant flex-shrink-0">
                        {b.type === 'hamali' ? <BoxIcon className="w-5 h-5" /> : <TruckIcon className="w-5 h-5" />}
                      </div>
                      <div className="flex flex-col items-start text-left min-w-0">
                        <span className="text-sm font-semibold text-ip-on-surface truncate">
                          {shortAddress(b.pickupLocation.address)} → {shortAddress(b.dropLocation.address)}
                        </span>
                        <span className="text-ip-body-sm text-ip-on-surface-variant">₹{b.fareBreakdown.total}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusChip tone={statusTone[b.status] ?? 'muted'}>{statusLabel[b.status] ?? b.status}</StatusChip>
                      <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
                    </div>
                  </Link>
                  {i < recent.length - 1 && <ListDivider />}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
