'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { StatusPill, bookingStatusTone } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionDeniedState } from '@/components/ui/PermissionDeniedState';
import { Skeleton } from '@/components/ui/Skeleton';
import { FlatRowList, FlatRow } from '@/components/ui/FlatRowList';
import { RotaryDial, type DialSector } from '@/components/ui/RotaryDial';
import { Media } from '@/components/ui/Media';
import { Icon } from '@/components/ui/Icon';
import { SupportAgentWidget } from '@/components/worker/AgentWidgets';
import { CATEGORY_ICONS, type ServiceCategory } from '@/components/booking/CategoryPicker';

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

// Same bucketing as before: `general_labour` is the traditional
// hamali/loading-crew category — the one thing genuinely distinct from a
// named household trade even though both ride dispatchType:'hamali'
// server-side, so slug (not dispatchType alone) is the discriminator.
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

const DIAL_SECTORS_META: Record<string, { glyph: string }> = {
  household: { glyph: 'home_repair_service' },
  labour: { glyph: 'engineering' },
  transport: { glyph: 'local_shipping' },
};

const SECTOR_HEADLINE: Record<string, string> = {
  household: 'Household\nservices',
  labour: 'Loading &\ncrew labour',
  transport: 'Trucks &\ntransport',
};

export default function CustomerDashboardPage() {
  const t = useTranslations('customerDashboard');
  const { user } = useAuth();
  const { addresses: savedAddresses } = useSavedAddresses();
  const [dialMode, setDialMode] = useState('household');

  const bookingsState = useApiState(
    () => api.get<{ bookings: BookingSummary[] }>('/api/bookings').then((r) => r.bookings),
    []
  );
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
  const activeBooking = bookings.find((b) => !['completed', 'cancelled'].includes(b.status));
  const recent = bookings.filter((b) => b._id !== activeBooking?._id).slice(0, 5);
  const activeStepIndex = activeBooking ? PROGRESS_STEPS.indexOf(activeBooking.status) : -1;
  const progressPct = activeStepIndex >= 0 ? Math.round((activeStepIndex / (PROGRESS_STEPS.length - 1)) * 100) : 0;

  const sectors: DialSector[] = [
    { key: 'household', label: t('dialHousehold'), glyph: DIAL_SECTORS_META.household.glyph },
    { key: 'labour', label: t('dialLabour'), glyph: DIAL_SECTORS_META.labour.glyph },
    { key: 'transport', label: t('dialTransport'), glyph: DIAL_SECTORS_META.transport.glyph },
  ];

  const currentBucket = dialMode === 'household' ? buckets.household : dialMode === 'labour' ? buckets.labour : buckets.transport;
  const [heroCategory, ...gridCategories] = currentBucket;

  return (
    <RotaryDial sectors={sectors} activeKey={dialMode} onChange={setDialMode}>
      <div className="min-h-screen bg-fyro-bone relative">
        <div className="fixed inset-0 pointer-events-none fyro-grain z-0 opacity-40" />

        {/* Fixed header — mirrors fyro_household_home/code.html's <header> almost line for line. */}
        <header className="fixed top-0 w-full z-40 bg-fyro-bone/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
          <div className="h-16 px-4 flex items-center justify-between max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
              {/* Brand mark — a real logo file drops into MEDIA_MANIFEST's
                  brand.wordmark later; at 32px, <Media>'s verbose id-label
                  placeholder is illegible, so this one small chrome slot
                  gets a plain initial mark instead of the generic system. */}
              <div className="h-8 w-8 rounded-full bg-fyro-brown text-white flex items-center justify-center font-heading font-bold text-sm shrink-0">F</div>
              <div className="flex flex-col">
                <span className="font-label-caps text-label-caps uppercase tracking-wider text-ip-outline">FYRO Cooperative</span>
                <h1 className="font-heading text-headline-sm text-fyro-ink leading-none">
                  {dialMode === 'household' ? 'Explore Services' : dialMode === 'labour' ? 'Loading & Crew' : 'Trucks & Transport'}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/customer/history" className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-ip-on-surface-variant hover:text-fyro-ink transition-colors">
                <Icon name="receipt_long" size={22} />
              </Link>
              <div className="w-8 h-8 rounded-full p-0.5 flex items-center justify-center bg-ip-surface-container-high overflow-hidden">
                {user?.profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.profilePhoto} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="font-heading font-bold text-fyro-brown text-sm">{(user?.name ?? '?')[0]?.toUpperCase()}</span>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="pt-16 pb-28 px-4 max-w-2xl mx-auto relative z-10">
          <div className="flex flex-col w-full relative pb-8">
            <NotificationPrompt accent="primary" copy={t('notifyPrompt')} />

            {/* Location + language + notifications row — right-padded so
                it never sits under the fixed dial pill (top-16 right-0). */}
            <div className="w-full flex items-center justify-between py-2 pl-1 pr-20 mb-3">
              <Link
                href="/customer/book"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-chip bg-ip-surface-container-highest text-ip-on-surface-variant text-[11px] font-medium shadow-sm"
              >
                <Icon name="location_on" size={14} className="text-fyro-brown" />
                <span className="truncate max-w-[130px]">{savedAddresses[0]?.label ?? t('setYourArea')}</span>
                <Icon name="expand_more" size={14} />
              </Link>
              <div className="flex items-center gap-2.5">
                <Link href="/customer/profile" className="px-2 py-0.5 rounded-chip bg-ip-surface-container-high text-ip-on-surface-variant font-label-caps text-label-caps tracking-wide uppercase">
                  EN / తె / हि
                </Link>
                <div className="relative">
                  <NotificationBell href="/customer/notifications" />
                </div>
              </div>
            </div>

            {/* Active dispatch — compact, real data only (no fabricated ETA/worker name). */}
            {activeBooking && (
              <Link href={`/customer/track/${activeBooking._id}`} className="w-full mb-4 px-1 block">
                <div className="flex items-center justify-between p-2.5 rounded-control bg-ip-surface-container-low shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-labour opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-ip-secondary" />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-label-caps text-label-caps text-ip-secondary uppercase font-semibold">{t('activeTracking')}</span>
                      <p className="font-body text-body-strong text-[12px] text-fyro-ink truncate">
                        {statusLabel[activeBooking.status] ?? activeBooking.status} · {shortAddress(activeBooking.pickupLocation.address)} → {shortAddress(activeBooking.dropLocation.address)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 p-1 rounded-full bg-ip-surface-container text-ip-on-surface-variant">
                    <Icon name="near_me" size={18} />
                  </span>
                </div>
                <div className="h-1 mx-1 mt-1.5 rounded-full bg-ip-outline/15 overflow-hidden">
                  <div className="h-full bg-accent-labour rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </Link>
            )}

            {/* Headline */}
            <div className="flex flex-col mb-4 px-1">
              <div className="max-w-[78%]">
                <h2 className="font-heading text-headline-lg-mobile text-fyro-ink tracking-tight leading-[1.05] whitespace-pre-line">
                  {SECTOR_HEADLINE[dialMode]}
                </h2>
                <p className="font-body text-body-default text-ip-on-surface-variant mt-1.5 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-ip-secondary" />
                  {currentBucket.length} {t('categoriesAvailable')}
                </p>
              </div>
            </div>

            {categoriesState.status === 'loading' && (
              <div className="w-full h-60 rounded-card bg-ip-surface-container animate-pulse mb-6" />
            )}
            {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} className="mb-6" />}

            {/* Hero card — first category in this sector, real photo placeholder, no fabricated price. */}
            {heroCategory && (
              <Link
                href={`/customer/book?category=${heroCategory.slug}`}
                className="relative w-full rounded-card overflow-hidden mb-6 shadow-md bg-fyro-brown block"
              >
                <Media
                  id={`household.category.${heroCategory.slug}`}
                  kind="photo"
                  aspect={1.6}
                  treatment="full-bleed"
                  tint="household"
                  alt={heroCategory.name}
                  className="w-full h-60"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-fyro-brown via-fyro-brown/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white flex flex-col">
                  <span className="self-start mb-1.5 px-2.5 py-0.5 rounded-chip bg-accent-labour text-fyro-ink font-label-caps text-label-caps tracking-wider uppercase font-semibold">
                    {t('mostBooked')}
                  </span>
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="font-heading text-headline-sm text-white leading-snug">{heroCategory.name}</h3>
                      <p className="font-body text-body-default text-white/70 text-xs">{t(`pricingUnit.${heroCategory.pricingUnit}` as never)}</p>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Category bento grid — real categories, varying tile sizes for visual rhythm. */}
            {gridCategories.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="font-heading text-[1.1rem] text-fyro-ink">{t('cooperativeGuilds')}</h3>
                  <span className="font-label-caps text-label-caps text-ip-outline uppercase tracking-wider">{t('fixedFairRate')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {gridCategories.map((c, i) => {
                    const CatIcon = CATEGORY_ICONS[c.icon];
                    const featured = i === 2; // one wide tile mid-grid, matching the reference's rhythm
                    return (
                      <Link
                        key={c._id}
                        href={`/customer/book?category=${c.slug}`}
                        className={`flex flex-col justify-between p-3.5 rounded-card bg-ip-surface-container-low shadow-sm ${featured ? 'col-span-2 flex-row items-center' : 'min-h-[170px]'}`}
                      >
                        <div className={featured ? 'flex items-center gap-3 min-w-0' : ''}>
                          <div className={`rounded-cell bg-ip-surface-container-high flex items-center justify-center text-fyro-brown ${featured ? 'w-11 h-11 shrink-0' : 'w-9 h-9 mb-2'}`}>
                            {CatIcon ? <CatIcon className="w-5 h-5" /> : <Icon name="handyman" size={20} />}
                          </div>
                          {!featured && (
                            <div className="w-full h-16 rounded-cell overflow-hidden mb-2 bg-ip-surface-container">
                              <Media id={`household.category.${c.slug}`} kind="photo" aspect={2} treatment="inline" tint="household" alt={c.name} className="w-full h-full" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-body text-body-strong text-[14px] text-fyro-ink leading-tight truncate">{c.name}</h4>
                            <p className="font-body text-body-default text-[11px] text-ip-on-surface-variant mt-0.5">{t(`pricingUnit.${c.pricingUnit}` as never)}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}

            {currentBucket.length === 0 && categoriesState.status !== 'loading' && (
              <EmptyState title={t('noCategoriesTitle')} className="mb-6" />
            )}

            {/* Cooperative Guarantee — legitimate static brand copy, not fabricated data. */}
            <div className="w-full p-4 rounded-card bg-ip-surface-container-high flex items-center justify-between shadow-sm mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-fyro-brown text-white flex items-center justify-center">
                  <Icon name="verified_user" size={18} />
                </div>
                <div>
                  <p className="font-body text-body-strong text-xs text-fyro-ink">{t('guaranteeTitle')}</p>
                  <p className="font-body text-body-default text-[11px] text-ip-on-surface-variant">{t('guaranteeHint')}</p>
                </div>
              </div>
              <Icon name="arrow_forward" size={18} className="text-ip-outline" />
            </div>

            {/* Recent bookings — preserved from the previous build, shared across all 3 sectors. */}
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-heading text-[1.1rem] text-fyro-ink">{t('recentBookings')}</h3>
              <Link href="/customer/history" className="text-sm font-semibold text-fyro-brown hover:underline">
                {t('seeAll')}
              </Link>
            </div>

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
                          <Icon name={b.type === 'hamali' ? 'engineering' : 'local_shipping'} size={18} />
                        </div>
                        <span className="truncate">{shortAddress(b.pickupLocation.address)} → {shortAddress(b.dropLocation.address)}</span>
                      </div>
                    }
                    right={
                      <div className="flex items-center gap-2">
                        <span>₹{b.fareBreakdown.total}</span>
                        <StatusPill tone={bookingStatusTone(b.status)}>{statusLabel[b.status] ?? b.status}</StatusPill>
                        <Icon name="chevron_right" size={16} className="text-ip-on-surface-variant" />
                      </div>
                    }
                  />
                ))}
              </FlatRowList>
            )}

            <div className="mt-5">
              <SupportAgentWidget accent="primary" />
            </div>
          </div>
        </main>
      </div>
    </RotaryDial>
  );
}
