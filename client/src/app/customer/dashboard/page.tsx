'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { api, ApiClientError } from '@/lib/api';
import { useNotificationPermission } from '@/lib/useNotificationPermission';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import {
  BellIcon,
  SearchIcon,
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
  { href: '/customer/book?type=truck', label: 'Truck', icon: TruckIcon },
  { href: '/customer/book?type=hamali', label: 'Hamali', icon: BoxIcon },
  { href: '/customer/book?type=combo', label: 'Combo', icon: LayersIcon },
  { href: '/customer/history', label: 'History', icon: ClockIcon },
];

const statusLabel: Record<string, string> = {
  requested: 'Requested',
  searching: 'Finding a match…',
  matched: 'Matched',
  accepted: 'Accepted',
  in_progress: 'On the way',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const statusPillClass: Record<string, string> = {
  requested: 'bg-text-muted/10 text-text-muted',
  searching: 'bg-text-muted/10 text-text-muted',
  matched: 'bg-secondary/10 text-secondary-600',
  accepted: 'bg-secondary/10 text-secondary-600',
  in_progress: 'bg-primary/10 text-primary-600',
  completed: 'bg-emerald-500/10 text-emerald-700',
  cancelled: 'bg-red-500/10 text-red-700',
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
  const recent = bookings.filter((b) => b._id !== activeBooking?._id).slice(0, 4);
  const activeStepIndex = activeBooking ? PROGRESS_STEPS.indexOf(activeBooking.status) : -1;

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      {/* Greeting */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Avatar name={user?.name ?? '?'} photoUrl={user?.profilePhoto} accent="primary" />
          <div>
            <p className="text-xs text-text-muted">Hello,</p>
            <p className="font-heading font-bold text-lg leading-tight">{firstName} 👋</p>
          </div>
        </div>
        <button
          type="button"
          aria-label={permission === 'granted' ? 'Alerts on' : 'Enable alerts'}
          onClick={() => permission === 'default' && request()}
          className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-fast ${
            permission === 'granted' ? 'bg-primary/15 text-primary-600' : 'bg-surface text-text-primary hover:bg-surface-raised hover:shadow-sm'
          }`}
        >
          <BellIcon className="w-5 h-5" />
        </button>
      </div>

      <NotificationPrompt accent="primary" copy="Get notified the instant a driver or Hamali is on the way." />

      {/* Quick-book search bar */}
      <div className="flex gap-3 mb-6">
        <Link
          href="/customer/book"
          className="flex-1 flex items-center gap-3 px-4 py-3.5 rounded-full bg-surface-raised border border-border shadow-sm text-text-muted hover:shadow-md hover:border-border-strong transition-all duration-base"
        >
          <SearchIcon className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">Where do you need pickup?</span>
        </Link>
        <Link
          href="/customer/track"
          aria-label="Track a booking"
          className="w-[52px] h-[52px] flex-shrink-0 rounded-full bg-primary-600 text-white flex items-center justify-center shadow-md hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-base"
        >
          <MapPinIcon className="w-5 h-5" />
        </Link>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {quickActions.map((qa) => (
          <Link
            key={qa.href}
            href={qa.href}
            className="flex flex-col items-center gap-2 py-3 rounded-md hover:bg-surface transition-colors duration-fast"
          >
            <div className="w-12 h-12 rounded-full bg-surface-raised shadow-sm flex items-center justify-center text-primary-600">
              <qa.icon className="w-5 h-5" />
            </div>
            <span className="text-xs font-medium text-text-muted">{qa.label}</span>
          </Link>
        ))}
      </div>

      {/* Current shipment — the one thing a customer with something in
          flight actually wants to see first, ahead of the promo card. */}
      {activeBooking && (
        <Link href={`/customer/track/${activeBooking._id}`} className="block mb-6">
          <Card elevation="raised" className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-base">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading text-lg font-bold">Current shipment</h2>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusPillClass[activeBooking.status] ?? 'bg-text-muted/10 text-text-muted'}`}>
                {statusLabel[activeBooking.status] ?? activeBooking.status}
              </span>
            </div>

            {activeStepIndex >= 0 && (
              <div className="flex items-center mb-4">
                {PROGRESS_STEPS.slice(0, 5).map((step, i) => (
                  <div key={step} className="flex items-center flex-1 last:flex-none">
                    <span
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${i <= activeStepIndex ? 'bg-primary-600' : 'bg-border-strong'}`}
                    />
                    {i < 4 && <span className={`h-0.5 flex-1 ${i < activeStepIndex ? 'bg-primary-600' : 'bg-border-strong'}`} />}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-muted">{new Date(activeBooking.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                <p className="font-medium truncate">{shortAddress(activeBooking.pickupLocation.address)}</p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-text-muted mx-2 flex-shrink-0" />
              <div className="min-w-0 flex-1 text-right">
                <p className="text-[11px] text-text-muted">In progress</p>
                <p className="font-medium truncate">{shortAddress(activeBooking.dropLocation.address)}</p>
              </div>
            </div>
          </Card>
        </Link>
      )}

      {/* Promo / primary CTA card */}
      <Link href="/customer/book" className="block mb-8">
        <div className="relative overflow-hidden rounded-lg bg-primary-600 text-white p-6 shadow-lg hover:shadow-glow-primary hover:-translate-y-0.5 transition-all duration-base">
          <TruckIcon className="pointer-events-none select-none absolute -right-3 -bottom-4 w-32 h-32 opacity-15" />
          <p className="font-heading text-xl font-extrabold leading-tight mb-1">
            Move anything.
            <br />
            Anywhere in AP.
          </p>
          <p className="text-sm text-white/85 mb-4 max-w-[80%]">
            Trucks from 1kg to 1000 tons, or Hamali labor — book in minutes.
          </p>
          <span className="inline-flex items-center gap-1 bg-white text-primary-600 text-sm font-semibold px-4 py-2 rounded-full">
            Book now
            <ChevronRightIcon className="w-4 h-4" />
          </span>
        </div>
      </Link>

      {/* Recent bookings */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-lg font-bold">Recent bookings</h2>
        <Link href="/customer/history" className="text-sm font-medium text-primary-600 hover:underline">
          See all
        </Link>
      </div>

      {loadState === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 rounded-lg bg-surface animate-pulse" />
          ))}
        </div>
      )}

      {loadState !== 'loading' && bookings.length === 0 && (
        <Card elevation="raised" className="text-center py-10">
          <p className="text-sm text-text-muted mb-4">No bookings yet.</p>
          <Link href="/customer/book" className="text-sm font-semibold text-primary-600 hover:underline">
            Book your first delivery →
          </Link>
        </Card>
      )}

      {loadState !== 'loading' && bookings.length > 0 && recent.length === 0 && (
        <Card elevation="flat" className="text-center py-8 text-sm text-text-muted">
          Nothing else yet — your current shipment above is the only one so far.
        </Card>
      )}

      {recent.length > 0 && (
        <div className="space-y-3">
          {recent.map((b) => (
            <Link key={b._id} href={`/customer/track/${b._id}`} className="block">
              <Card
                elevation="raised"
                className="hover:shadow-lg hover:-translate-y-0.5 transition-all duration-base"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-8 h-8 rounded-full bg-secondary/10 text-secondary-600 flex items-center justify-center flex-shrink-0">
                      {b.type === 'hamali' ? <BoxIcon className="w-4 h-4" /> : <TruckIcon className="w-4 h-4" />}
                    </span>
                    <p className="font-heading font-bold text-sm truncate">
                      {shortAddress(b.pickupLocation.address)} <span className="text-text-muted font-normal">→</span> {shortAddress(b.dropLocation.address)}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-1 rounded-full ${statusPillClass[b.status] ?? 'bg-text-muted/10 text-text-muted'}`}>
                    {statusLabel[b.status] ?? b.status}
                  </span>
                </div>
                <p className="text-xs text-text-muted">₹{b.fareBreakdown.total}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
