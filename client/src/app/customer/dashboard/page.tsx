'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { bucketCategories } from '@/lib/categoryBuckets';

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
  const router = useRouter();
  const { addresses: savedAddresses } = useSavedAddresses();

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
  // The dial navigates to the OTHER mode's own dedicated page here — this
  // page (household) is one of the three destinations, not a content
  // switcher hosting all three, matching how every real Stitch screen
  // (fyro_household_home, fyro_hamali_labour_standard, fyro_goods_transport)
  // is its own full page with the same dial, not one shared shell.
  function handleDialChange(key: string) {
    if (key === 'labour') router.push('/customer/book/labour');
    else if (key === 'transport') router.push('/customer/book/transport');
  }

  const currentBucket = buckets.household;
  const [heroCategory, ...gridCategories] = currentBucket;

  return (
    <RotaryDial sectors={sectors} activeKey="household" onChange={handleDialChange}>
      <div className="min-h-screen bg-fy-bone relative">
        <div className="fixed inset-0 pointer-events-none fyro-grain z-0 opacity-40" />

        {/* Fixed header — mirrors fyro_household_home/code.html's <header> almost line for line. */}
        <header className="fixed top-0 w-full z-40 bg-fy-bone/85 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
          <div className="h-16 px-4 flex items-center justify-between max-w-2xl mx-auto">
            <div className="flex items-center gap-2">
              {/* Brand mark — a real logo file drops into MEDIA_MANIFEST's
                  brand.wordmark later; at 32px, <Media>'s verbose id-label
                  placeholder is illegible, so this one small chrome slot
                  gets a plain initial mark instead of the generic system. */}
              <div className="h-8 w-8 rounded-full bg-fy-brown text-white flex items-center justify-center font-heading font-bold text-sm shrink-0">F</div>
              <div className="flex flex-col">
                <span className="font-body text-eyebrow uppercase tracking-wider text-fy-muted">FYRO Cooperative</span>
                <h1 className="font-heading text-title text-fy-ink leading-none">Explore Services</h1>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/customer/history" className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-fy-ink-soft hover:text-fy-ink transition-colors">
                <Icon name="receipt_long" size={22} />
              </Link>
              <div className="w-8 h-8 rounded-full p-0.5 flex items-center justify-center bg-fy-well overflow-hidden">
                {user?.profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.profilePhoto} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="font-heading font-bold text-fy-brown text-sm">{(user?.name ?? '?')[0]?.toUpperCase()}</span>
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
                href="/customer/book/household"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-fy-edge text-fy-ink-soft text-[11px] font-medium shadow-sm"
              >
                <Icon name="location_on" size={14} className="text-fy-brown" />
                <span className="truncate max-w-[130px]">{savedAddresses[0]?.label ?? t('setYourArea')}</span>
                <Icon name="expand_more" size={14} />
              </Link>
              <div className="flex items-center gap-2.5">
                <Link href="/customer/profile" className="px-2 py-0.5 rounded-full bg-fy-well text-fy-ink-soft font-body text-eyebrow tracking-wide uppercase">
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
                <div className="flex items-center justify-between p-2.5 rounded-control bg-fy-panel shadow-sm">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fy-lime opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fy-green" />
                    </span>
                    <div className="flex flex-col min-w-0">
                      <span className="font-body text-eyebrow text-fy-green uppercase font-semibold">{t('activeTracking')}</span>
                      <p className="font-body text-body text-[12px] text-fy-ink truncate">
                        {statusLabel[activeBooking.status] ?? activeBooking.status} · {shortAddress(activeBooking.pickupLocation.address)} → {shortAddress(activeBooking.dropLocation.address)}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 p-1 rounded-full bg-fy-field text-fy-ink-soft">
                    <Icon name="near_me" size={18} />
                  </span>
                </div>
                <div className="h-1 mx-1 mt-1.5 rounded-full bg-fy-muted/15 overflow-hidden">
                  <div className="h-full bg-fy-lime rounded-full transition-all" style={{ width: `${progressPct}%` }} />
                </div>
              </Link>
            )}

            {/* Headline */}
            <div className="flex flex-col mb-4 px-1">
              <div className="max-w-[78%]">
                <h2 className="font-heading text-heading text-fy-ink tracking-tight leading-[1.05] whitespace-pre-line">
                  {SECTOR_HEADLINE.household}
                </h2>
                <p className="font-body text-body text-fy-ink-soft mt-1.5 flex items-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-fy-green" />
                  {currentBucket.length} {t('categoriesAvailable')}
                </p>
              </div>
            </div>

            {categoriesState.status === 'loading' && (
              <div className="w-full h-60 rounded-card bg-fy-field animate-pulse mb-6" />
            )}
            {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} className="mb-6" />}

            {/* Hero card — first category in this sector, real photo placeholder, no fabricated price. */}
            {heroCategory && (
              <Link
                href={`/customer/book/household?category=${heroCategory.slug}`}
                className="relative w-full rounded-card overflow-hidden mb-6 shadow-md bg-fy-brown block"
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
                <div className="absolute inset-0 bg-gradient-to-t from-fy-brown via-fy-brown/50 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4 text-white flex flex-col">
                  <span className="self-start mb-1.5 px-2.5 py-0.5 rounded-full bg-fy-lime text-fy-ink font-body text-eyebrow tracking-wider uppercase font-semibold">
                    {t('mostBooked')}
                  </span>
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="font-heading text-title text-white leading-snug">{heroCategory.name}</h3>
                      <p className="font-body text-body text-white/70 text-xs">{t(`pricingUnit.${heroCategory.pricingUnit}` as never)}</p>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Category bento grid — real categories, varying tile sizes for visual rhythm. */}
            {gridCategories.length > 0 && (
              <>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="font-heading text-[1.1rem] text-fy-ink">{t('cooperativeGuilds')}</h3>
                  <span className="font-body text-eyebrow text-fy-muted uppercase tracking-wider">{t('fixedFairRate')}</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {gridCategories.map((c, i) => {
                    const CatIcon = CATEGORY_ICONS[c.icon];
                    const featured = i === 2; // one wide tile mid-grid, matching the reference's rhythm
                    return (
                      <Link
                        key={c._id}
                        href={`/customer/book/household?category=${c.slug}`}
                        className={`flex flex-col justify-between p-3.5 rounded-card bg-fy-panel shadow-sm ${featured ? 'col-span-2 flex-row items-center' : 'min-h-[170px]'}`}
                      >
                        <div className={featured ? 'flex items-center gap-3 min-w-0' : ''}>
                          <div className={`rounded-cell bg-fy-well flex items-center justify-center text-fy-brown ${featured ? 'w-11 h-11 shrink-0' : 'w-9 h-9 mb-2'}`}>
                            {CatIcon ? <CatIcon className="w-5 h-5" /> : <Icon name="handyman" size={20} />}
                          </div>
                          {!featured && (
                            <div className="w-full h-16 rounded-cell overflow-hidden mb-2 bg-fy-field">
                              <Media id={`household.category.${c.slug}`} kind="photo" aspect={2} treatment="inline" tint="household" alt={c.name} className="w-full h-full" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <h4 className="font-body text-body text-[14px] text-fy-ink leading-tight truncate">{c.name}</h4>
                            <p className="font-body text-body text-[11px] text-fy-ink-soft mt-0.5">{t(`pricingUnit.${c.pricingUnit}` as never)}</p>
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
            <div className="w-full p-4 rounded-card bg-fy-well flex items-center justify-between shadow-sm mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-fy-brown text-white flex items-center justify-center">
                  <Icon name="verified_user" size={18} />
                </div>
                <div>
                  <p className="font-body text-body text-xs text-fy-ink">{t('guaranteeTitle')}</p>
                  <p className="font-body text-body text-[11px] text-fy-ink-soft">{t('guaranteeHint')}</p>
                </div>
              </div>
              <Icon name="arrow_forward" size={18} className="text-fy-muted" />
            </div>

            {/* Recent bookings — preserved from the previous build, shared across all 3 sectors. */}
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="font-heading text-[1.1rem] text-fy-ink">{t('recentBookings')}</h3>
              <Link href="/customer/history" className="text-sm font-semibold text-fy-brown hover:underline">
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
                  <Link href="/customer/book/household" className="text-sm font-semibold text-fy-brown hover:underline">
                    {t('bookFirst')}
                  </Link>
                }
              />
            )}
            {bookingsState.status === 'success' && recent.length === 0 && (
              <p className="text-center py-6 text-body text-fy-ink-soft font-body">{t('onlyActiveNote')}</p>
            )}
            {recent.length > 0 && (
              <FlatRowList>
                {recent.map((b) => (
                  <FlatRow
                    key={b._id}
                    href={`/customer/track/${b._id}`}
                    left={
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-fy-edge flex items-center justify-center text-fy-ink-soft flex-shrink-0">
                          <Icon name={b.type === 'hamali' ? 'engineering' : 'local_shipping'} size={18} />
                        </div>
                        <span className="truncate">{shortAddress(b.pickupLocation.address)} → {shortAddress(b.dropLocation.address)}</span>
                      </div>
                    }
                    right={
                      <div className="flex items-center gap-2">
                        <span>₹{b.fareBreakdown.total}</span>
                        <StatusPill tone={bookingStatusTone(b.status)}>{statusLabel[b.status] ?? b.status}</StatusPill>
                        <Icon name="chevron_right" size={16} className="text-fy-ink-soft" />
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
