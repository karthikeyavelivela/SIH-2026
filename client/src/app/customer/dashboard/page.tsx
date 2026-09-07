'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useNotificationPermission } from '@/lib/useNotificationPermission';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { StatusPill, bookingStatusTone } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionDeniedState } from '@/components/ui/PermissionDeniedState';
import { Skeleton } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section } from '@/components/ui/Section';
import { FlatRowList, FlatRow } from '@/components/ui/FlatRowList';
import { RotaryDial, type DialSector } from '@/components/ui/RotaryDial';
import { SupportAgentWidget } from '@/components/worker/AgentWidgets';
import { CATEGORY_ICONS, type ServiceCategory } from '@/components/booking/CategoryPicker';
import { BellIcon, TruckIcon, BoxIcon, HomeIcon, UsersIcon, ChevronRightIcon } from '@/components/ui/icons';

interface BookingSummary {
  _id: string;
  type: 'truck' | 'hamali' | 'combo';
  status: string;
  fareBreakdown: { total: number };
  pickupLocation: { address: string };
  dropLocation: { address: string };
  createdAt: string;
}

const PROGRESS_STEPS = ['requested', 'searching', 'matched', 'accepted', 'in_progress', 'completed'];

function shortAddress(address: string): string {
  return address.split(',')[0];
}

// Buckets the platform's 12 service categories into the dial's 3 sectors.
// `general_labour` is the traditional hamali/loading-crew category — the
// one thing genuinely distinct from a named household trade even though
// both ride the same `dispatchType:'hamali'` dispatch path server-side, so
// slug (not dispatchType alone) is the discriminator. Everything else with
// dispatchType:'truck' (cargo logistics + driver) is Transport; the
// remaining 9 named trades (electrician, plumber, ...) are Household.
function bucketCategories(categories: ServiceCategory[]) {
  const household: ServiceCategory[] = [];
  const labour: ServiceCategory[] = [];
  const transport: ServiceCategory[] = [];
  for (const c of categories) {
    if (c.slug === 'general_labour') labour.push(c);
    else if (c.dispatchType === 'truck') transport.push(c);
    else household.push(c);
  }
  return { household, labour, transport };
}

export default function CustomerDashboardPage() {
  const t = useTranslations('customerDashboard');
  const { user } = useAuth();
  const { permission, request } = useNotificationPermission();
  const [dialMode, setDialMode] = useState('household');

  const bookingsState = useApiState(
    () => api.get<{ bookings: BookingSummary[] }>('/api/bookings').then((r) => r.bookings),
    []
  );
  // Prefetched once, up front — bucketed client-side into all 3 dial
  // sectors so switching sectors is a pure render, never a new fetch
  // (Phase 1.1's "no loading frame between modes" requirement).
  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );
  const buckets = useMemo(() => bucketCategories(categoriesState.data ?? []), [categoriesState.data]);

  const statusLabel: Record<string, string> = {
    scheduled: t('status.scheduled'),
    requested: t('status.requested'),
    searching: t('status.searching'),
    matched: t('status.matched'),
    accepted: t('status.accepted'),
    in_progress: t('status.in_progress'),
    completed: t('status.completed'),
    cancelled: t('status.cancelled'),
  };

  const bookings = bookingsState.data ?? [];
  const firstName = user?.name?.split(' ')[0] ?? t('thereFallback');
  const activeBooking = bookings.find((b) => !['completed', 'cancelled'].includes(b.status));
  const recent = bookings.filter((b) => b._id !== activeBooking?._id).slice(0, 5);
  const activeStepIndex = activeBooking ? PROGRESS_STEPS.indexOf(activeBooking.status) : -1;
  const progressPct = activeStepIndex >= 0 ? Math.round((activeStepIndex / (PROGRESS_STEPS.length - 1)) * 100) : 0;

  const sectors: DialSector[] = [
    { key: 'household', label: t('dialHousehold'), icon: <HomeIcon /> },
    { key: 'labour', label: t('dialLabour'), icon: <UsersIcon /> },
    { key: 'transport', label: t('dialTransport'), icon: <TruckIcon /> },
  ];

  return (
    <RotaryDial sectors={sectors} activeKey={dialMode} onChange={setDialMode}>
      <div className="min-h-screen bg-fyro-bone">
        <header className="w-full sticky top-0 z-20 bg-fyro-bone/90 backdrop-blur-sm flex justify-between items-center px-ip-edge py-3 max-w-[600px] mx-auto">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full bg-white overflow-hidden flex-shrink-0 flex items-center justify-center text-fyro-brown font-heading font-bold"
              aria-hidden="true"
            >
              {user?.profilePhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.profilePhoto} alt="" className="w-full h-full object-cover" />
              ) : (
                (user?.name ?? '?')[0]?.toUpperCase()
              )}
            </div>
            <h1 className="font-heading font-bold text-headline-sm text-fyro-brown tracking-tight uppercase truncate">FYRO</h1>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <NotificationBell href="/customer/notifications" />
            <button
              type="button"
              aria-label={permission === 'granted' ? t('alertsOn') : t('enableAlerts')}
              onClick={() => permission === 'default' && request()}
              className={`w-10 h-10 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${
                permission === 'granted' ? 'bg-accent-labour/25 text-fyro-ink' : 'text-ip-on-surface-variant hover:bg-fyro-ink/5'
              }`}
            >
              <BellIcon className="w-5 h-5" />
            </button>
          </div>
        </header>

        <main className="max-w-[600px] mx-auto px-ip-edge pt-ip-lg pb-ip-xl flex flex-col gap-ip-xl">
          <NotificationPrompt accent="primary" copy={t('notifyPrompt')} />

          <PageHeader title={firstName} subline={t('welcomeBack')} />

          {/* Mode-specific primary action — the one thing that actually
              changes between dial sectors. Everything else on this page
              (tracker, recent bookings, AI widget) is shared, since a
              customer's own bookings aren't mode-specific. */}
          {dialMode === 'household' && (
            <Section title={t('categoriesHeading')}>
              {categoriesState.status === 'loading' && (
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-card" />)}
                </div>
              )}
              {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} />}
              {(categoriesState.status === 'success' || categoriesState.status === 'empty') && (
                <div className="grid grid-cols-3 gap-2">
                  {buckets.household.map((c) => {
                    const Icon = CATEGORY_ICONS[c.icon] ?? BoxIcon;
                    return (
                      <Link
                        key={c._id}
                        href={`/customer/book?category=${c.slug}`}
                        className="flex flex-col items-center gap-1.5 py-3.5 px-1 rounded-card border border-fyro-ink/10 bg-white/40 text-fyro-ink text-center hover:bg-accent-household/8 hover:border-accent-household/30 transition-colors"
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-[11px] font-semibold leading-tight">{c.name}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Section>
          )}

          {dialMode === 'labour' && (
            <Section title={t('dialLabour')}>
              <Link
                href="/customer/book?category=general_labour"
                className="rounded-card border border-accent-labour/30 bg-accent-labour/10 p-5 flex items-center gap-4 hover:bg-accent-labour/16 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-accent-labour text-fyro-ink flex items-center justify-center shrink-0">
                  <BoxIcon className="w-6 h-6" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-heading text-body-strong text-fyro-ink">{t('labourQuickBookTitle')}</span>
                  <span className="text-body-default text-ip-on-surface-variant font-body">{t('labourQuickBookHint')}</span>
                </div>
              </Link>
            </Section>
          )}

          {dialMode === 'transport' && (
            <Section title={t('dialTransport')}>
              <Link
                href="/customer/book?category=general_logistics"
                className="rounded-card border border-accent-transport/30 bg-accent-transport/10 p-5 flex items-center gap-4 hover:bg-accent-transport/16 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-accent-transport text-white flex items-center justify-center shrink-0">
                  <TruckIcon className="w-6 h-6" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="font-heading text-body-strong text-fyro-ink">{t('transportQuickBookTitle')}</span>
                  <span className="text-body-default text-ip-on-surface-variant font-body">{t('transportQuickBookHint')}</span>
                </div>
              </Link>
            </Section>
          )}

          {activeBooking && (
            <Section title={t('activeTracking')}>
              <Link href={`/customer/track/${activeBooking._id}`} className="rounded-card border border-fyro-ink/10 bg-white/50 p-5 flex flex-col gap-4 hover:bg-white/70 transition-colors">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex flex-col gap-1">
                    <StatusPill tone={bookingStatusTone(activeBooking.status)} dot>
                      {statusLabel[activeBooking.status] ?? activeBooking.status}
                    </StatusPill>
                    <span className="font-heading font-semibold text-data-metric text-fyro-ink tabular-nums">
                      ₹{activeBooking.fareBreakdown.total}
                    </span>
                  </div>
                  <span className="text-xs text-ip-on-surface-variant text-right">
                    {new Date(activeBooking.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-fyro-ink/10 relative">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-accent-labour rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
                <div className="flex justify-between text-body-default text-ip-on-surface-variant gap-3 font-body">
                  <span className="truncate">{shortAddress(activeBooking.pickupLocation.address)}</span>
                  <span className="truncate text-right">{shortAddress(activeBooking.dropLocation.address)}</span>
                </div>
              </Link>
            </Section>
          )}

          <Section
            title={t('recentBookings')}
            right={
              <Link href="/customer/history" className="text-sm font-semibold text-fyro-brown hover:underline">
                {t('seeAll')}
              </Link>
            }
          >
            {bookingsState.status === 'loading' && <Skeleton lines={3} className="h-16" />}
            {bookingsState.status === 'error' && <ErrorState onRetry={bookingsState.reload} />}
            {bookingsState.status === 'forbidden' && <PermissionDeniedState />}

            {bookingsState.status === 'empty' && (
              <EmptyState
                title={t('noBookingsTitle')}
                description={t('noBookingsDescription')}
                action={
                  <Link href="/customer/book" className="text-sm font-semibold text-fyro-brown hover:underline">
                    {t('bookFirst')}
                  </Link>
                }
              />
            )}

            {bookingsState.status === 'success' && recent.length === 0 && (
              <p className="text-center py-6 text-body-default text-ip-on-surface-variant font-body">{t('onlyActiveNote')}</p>
            )}

            {recent.length > 0 && (
              <FlatRowList>
                {recent.map((b) => (
                  <FlatRow
                    key={b._id}
                    href={`/customer/track/${b._id}`}
                    left={
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-ip-surface-container-highest flex items-center justify-center text-ip-on-surface-variant flex-shrink-0">
                          {b.type === 'hamali' ? <BoxIcon className="w-5 h-5" /> : <TruckIcon className="w-5 h-5" />}
                        </div>
                        <span className="truncate">{shortAddress(b.pickupLocation.address)} → {shortAddress(b.dropLocation.address)}</span>
                      </div>
                    }
                    right={
                      <div className="flex items-center gap-2">
                        <span>₹{b.fareBreakdown.total}</span>
                        <StatusPill tone={bookingStatusTone(b.status)}>{statusLabel[b.status] ?? b.status}</StatusPill>
                        <ChevronRightIcon className="w-4 h-4 text-ip-on-surface-variant" />
                      </div>
                    }
                  />
                ))}
              </FlatRowList>
            )}
          </Section>

          <SupportAgentWidget accent="primary" />
        </main>
      </div>
    </RotaryDial>
  );
}
