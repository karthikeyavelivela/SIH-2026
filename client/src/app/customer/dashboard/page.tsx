'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { usePublishedRates } from '@/lib/usePublishedRates';
import { bucketCategories } from '@/lib/categoryBuckets';
import { NotificationPrompt } from '@/components/ui/NotificationPrompt';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { PermissionDeniedState } from '@/components/ui/PermissionDeniedState';
import { Skeleton } from '@/components/ui/Skeleton';
import { RotaryDial, type DialSector } from '@/components/ui/RotaryDial';
import { Icon } from '@/components/ui/Icon';
import { SupportAgentWidget } from '@/components/worker/AgentWidgets';
import { type ServiceCategory } from '@/components/booking/CategoryPicker';
import { LightCard, Panel, Section, IconTile } from '@/components/fy/Surfaces';
import { EyebrowLabel, SectionHeading, Body } from '@/components/fy/Text';
import { StatusPill } from '@/components/fy/Status';
import { DataList, DataRow, ProgressBar } from '@/components/fy/Data';
import { PhotoCard } from '@/components/fy/Media';
import { TopBar } from '@/components/fy/Navigation';
import { CustomerTabBar } from '@/components/fy/CustomerTabBar';
import { bookingStatusTone } from '@/components/ui/StatusPill';

/* Built against client/public/design/household_home.html.

   Section order there, top to bottom: fixed 64px brand bar (eyebrow +
   serif "Explore Services", receipt action, avatar) -> the dial pill
   pinned top-right -> location / language / notifications row -> active
   dispatch strip -> "Household services" display heading with a live
   count -> 240px hero photo card under a brown scrim -> "Cooperative
   Guilds" bento grid of category tiles -> specialists carousel ->
   cooperative-guarantee strip -> 4-tab bottom bar.

   Largest element: the "Household services" heading. Dark surfaces: the
   hero scrim and the wide AC-repair tile. Everything else light on bone.

   Two slots carry no honest data and are handled explicitly below: the
   "142 verified members near you" count, and the specialists carousel. */

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

// Which glyph each category gets in the bento grid. Keyed by the real
// `icon` value the ServiceCategory documents carry.
const CATEGORY_GLYPH: Record<string, string> = {
  electrician: 'bolt',
  plumber: 'plumbing',
  carpenter: 'carpenter',
  painter: 'format_paint',
  domestic_helper: 'home_work',
  caregiver: 'volunteer_activism',
  gardener: 'potted_plant',
  cleaner: 'cleaning_services',
  technician: 'build',
  driver: 'local_taxi',
  general_logistics: 'local_shipping',
  general_labour: 'engineering',
};

export default function CustomerDashboardPage() {
  const t = useTranslations('customerDashboard');
  const { user } = useAuth();
  const router = useRouter();
  const { addresses: savedAddresses } = useSavedAddresses();
  const { rateFor } = usePublishedRates();

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
    { key: 'household', label: t('dialHousehold'), glyph: 'home_repair_service' },
    { key: 'labour', label: t('dialLabour'), glyph: 'engineering' },
    { key: 'transport', label: t('dialTransport'), glyph: 'local_shipping' },
  ];
  function handleDialChange(key: string) {
    if (key === 'labour') router.push('/customer/book/labour');
    else if (key === 'transport') router.push('/customer/book/transport');
  }

  const household = buckets.household;
  const [heroCategory, ...gridCategories] = household;

  function priceLine(c: ServiceCategory) {
    const rate = rateFor(c);
    if (!rate) return null;
    return (
      <span className="flex items-baseline gap-1">
        <span className="font-heading text-title text-fy-brown">₹{rate.minimumFare}</span>
        <EyebrowLabel>{t(`pricingUnit.${c.pricingUnit}` as never)}</EyebrowLabel>
      </span>
    );
  }

  return (
    <RotaryDial sectors={sectors} activeKey="household" onChange={handleDialChange}>
      <div className="min-h-screen bg-fy-bone relative">
        <div aria-hidden className="fixed inset-0 pointer-events-none fy-grain z-0 opacity-40" />

        <TopBar
          eyebrow="FYRO Cooperative"
          title={t('exploreServices')}
          actions={
            <>
              <Link
                href="/customer/history"
                aria-label={t('bookingHistory')}
                className="w-11 h-11 rounded-full flex items-center justify-center text-fy-ink-soft hover:text-fy-ink transition-colors"
              >
                <Icon name="receipt_long" size={22} />
              </Link>
              <Link
                href="/customer/profile"
                aria-label={t('yourProfile')}
                className="w-8 h-8 rounded-full bg-fy-well flex items-center justify-center overflow-hidden"
              >
                {user?.profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.profilePhoto} alt="" className="w-full h-full rounded-full object-cover" />
                ) : (
                  <span className="font-heading font-bold text-fy-brown text-sm">
                    {(user?.name ?? '?')[0]?.toUpperCase()}
                  </span>
                )}
              </Link>
            </>
          }
        />

        <main className="pt-16 pb-28 px-gutter max-w-2xl mx-auto relative z-10 flex flex-col gap-4">
          <NotificationPrompt accent="primary" copy={t('notifyPrompt')} />

          {/* Right-padded so it never sits under the dial pill at top-16 right-0. */}
          <div className="flex items-center justify-between gap-2 pr-20 pt-2">
            <Link
              href="/customer/profile"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-fy-edge text-fy-ink-soft font-body text-label shadow-card min-w-0"
            >
              <Icon name="location_on" size={14} className="text-fy-brown shrink-0" />
              <span className="truncate max-w-[130px]">{savedAddresses[0]?.label ?? t('setYourArea')}</span>
              <Icon name="expand_more" size={14} className="shrink-0" />
            </Link>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link
                href="/customer/profile"
                className="px-2 py-0.5 rounded-full bg-fy-well text-fy-ink-soft font-body text-eyebrow uppercase"
              >
                EN / తె / हि
              </Link>
              <NotificationBell href="/customer/notifications" />
            </div>
          </div>

          {activeBooking && (
            <Link href={`/customer/track/${activeBooking._id}`} className="block">
              <LightCard className="p-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fy-lime opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-fy-green" />
                  </span>
                  <div className="flex flex-col min-w-0">
                    <EyebrowLabel tone="green">{t('activeTracking')}</EyebrowLabel>
                    <p className="font-body text-label text-fy-ink truncate">
                      {statusLabel[activeBooking.status] ?? activeBooking.status} ·{' '}
                      {shortAddress(activeBooking.pickupLocation.address)} →{' '}
                      {shortAddress(activeBooking.dropLocation.address)}
                    </p>
                  </div>
                </div>
                <IconTile tone="peach" size="sm" className="rounded-full">
                  <Icon name="near_me" size={18} />
                </IconTile>
              </LightCard>
              <ProgressBar value={progressPct} tone="lime" className="mt-1.5 mx-1" />
            </Link>
          )}

          <div className="max-w-[78%]">
            <h2 className="font-heading text-heading text-fy-ink leading-[1.05] whitespace-pre-line">
              {t('householdHeadline')}
            </h2>
            {/* The design reads "142 verified cooperative members near you".
                Nothing server-side counts nearby available workers, so this
                shows the one live figure that does exist. */}
            <Body className="mt-1.5 flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full bg-fy-green" />
              {t('categoriesAvailableCount', { count: household.length })}
            </Body>
          </div>

          {categoriesState.status === 'loading' && <div className="w-full h-60 rounded-card bg-fy-field animate-pulse" />}
          {categoriesState.status === 'error' && <ErrorState onRetry={categoriesState.reload} />}

          {heroCategory && (
            <Link href={`/customer/book/household?category=${heroCategory.slug}`} className="block">
              <PhotoCard
                id={`household.category.${heroCategory.slug}`}
                alt={heroCategory.name}
                height="hero"
                scrim="brown"
                className="shadow-card"
                overlay={
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      {/* `guaranteeEligible` is a real per-category flag. The
                          design's "Most Booked" would need booking-frequency
                          stats that nothing computes, so this shows the one
                          claim the category document actually supports. */}
                      {heroCategory.guaranteeEligible ? (
                        <StatusPill tone="lime">{t('workmanshipGuarantee')}</StatusPill>
                      ) : (
                        <span />
                      )}
                      <EyebrowLabel tone="on-dark" className="opacity-80">
                        {t('householdGuild')}
                      </EyebrowLabel>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <SectionHeading as="h3" tone="on-dark">
                          {heroCategory.name}
                        </SectionHeading>
                        <Body tone="on-dark" size="label" className="opacity-80">
                          {t(`pricingUnit.${heroCategory.pricingUnit}` as never)}
                        </Body>
                      </div>
                      {rateFor(heroCategory) && (
                        <div className="text-right shrink-0">
                          <EyebrowLabel tone="on-dark" className="opacity-80">
                            {t('from')}
                          </EyebrowLabel>
                          <p className="font-heading text-metric text-fy-bone leading-none">
                            ₹{rateFor(heroCategory)!.minimumFare}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                }
              />
            </Link>
          )}

          {gridCategories.length > 0 && (
            <Section
              title={<SectionHeading>{t('cooperativeGuilds')}</SectionHeading>}
              aside={<EyebrowLabel>{t('fixedFairRate')}</EyebrowLabel>}
            >
              <div className="grid grid-cols-2 gap-3">
                {gridCategories.map((c, i) => {
                  // One wide tile mid-grid, matching the reference's rhythm.
                  const wide = i === 2;
                  return (
                    <Link
                      key={c._id}
                      href={`/customer/book/household?category=${c.slug}`}
                      className={wide ? 'col-span-2' : ''}
                    >
                      {wide ? (
                        <div className="flex items-center justify-between gap-3 p-4 rounded-card bg-fy-brown text-fy-on-brown shadow-card">
                          <div className="flex items-center gap-3 min-w-0">
                            <IconTile tone="brown" size="lg" className="bg-fy-brown-soft">
                              <Icon name={CATEGORY_GLYPH[c.slug] ?? 'handyman'} size={24} />
                            </IconTile>
                            <div className="min-w-0">
                              <h4 className="font-body text-body font-semibold truncate">{c.name}</h4>
                              <p className="font-body text-label text-fy-on-brown-soft truncate">
                                {t(`pricingUnit.${c.pricingUnit}` as never)}
                              </p>
                            </div>
                          </div>
                          {rateFor(c) && (
                            <div className="text-right shrink-0">
                              <p className="font-heading text-title text-fy-lime leading-none">₹{rateFor(c)!.minimumFare}</p>
                              <EyebrowLabel tone="on-dark" className="opacity-80">
                                {t('from')}
                              </EyebrowLabel>
                            </div>
                          )}
                        </div>
                      ) : (
                        <LightCard className="h-full flex flex-col justify-between p-3.5 min-h-[190px]">
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <IconTile tone="peach" size="sm" className="bg-fy-well text-fy-brown">
                                <Icon name={CATEGORY_GLYPH[c.slug] ?? 'handyman'} size={20} />
                              </IconTile>
                              {c.guaranteeEligible && (
                                <StatusPill tone="neutral">{t('guaranteed')}</StatusPill>
                              )}
                            </div>
                            <PhotoCard
                              id={`household.category.${c.slug}`}
                              alt={c.name}
                              height="tile"
                              scrim="none"
                              className="mb-2"
                            />
                            <h4 className="font-body text-body font-semibold text-fy-ink leading-tight">{c.name}</h4>
                          </div>
                          <div className="mt-2 pt-2">{priceLine(c)}</div>
                        </LightCard>
                      )}
                    </Link>
                  );
                })}
              </div>
            </Section>
          )}

          {household.length === 0 && categoriesState.status !== 'loading' && (
            <EmptyState title={t('noCategoriesTitle')} />
          )}

          {/* The design carries a "Specialists Near You" carousel of named
              member-owners with ratings. Ratings exist (the Rating model),
              but nothing exposes a browsable directory of workers to a
              customer and no endpoint returns nearby available members, so
              there is no honest way to populate it. Deliberately omitted
              rather than filled with invented people — flagged in the
              report so it can be built properly. */}

          <Panel className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <IconTile tone="brown" className="rounded-full">
                <Icon name="verified_user" size={18} />
              </IconTile>
              <div className="min-w-0">
                <p className="font-body text-label font-semibold text-fy-ink">{t('guaranteeTitle')}</p>
                <Body size="label">{t('guaranteeHint')}</Body>
              </div>
            </div>
            <Icon name="arrow_forward" size={18} className="text-fy-muted shrink-0" />
          </Panel>

          <Section
            title={<SectionHeading>{t('recentBookings')}</SectionHeading>}
            aside={
              <Link href="/customer/history" className="font-body text-label font-semibold text-fy-brown hover:underline">
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
                  <Link href="/customer/book/household" className="font-body text-label font-semibold text-fy-brown hover:underline">
                    {t('bookFirst')}
                  </Link>
                }
              />
            )}
            {bookingsState.status === 'success' && recent.length === 0 && (
              <Body className="text-center py-6">{t('onlyActiveNote')}</Body>
            )}
            {recent.length > 0 && (
              <DataList>
                {recent.map((b) => (
                  <DataRow
                    key={b._id}
                    lead={
                      <IconTile tone="peach" size="md" className="bg-fy-edge text-fy-ink-soft rounded-full">
                        <Icon name={b.type === 'hamali' ? 'engineering' : 'local_shipping'} size={18} />
                      </IconTile>
                    }
                    title={`${shortAddress(b.pickupLocation.address)} → ${shortAddress(b.dropLocation.address)}`}
                    meta={`₹${b.fareBreakdown.total}`}
                    trailing={
                      <StatusPill tone={bookingStatusTone(b.status) === 'success' ? 'lime' : 'neutral'}>
                        {statusLabel[b.status] ?? b.status}
                      </StatusPill>
                    }
                    onClick={() => router.push(`/customer/track/${b._id}`)}
                  />
                ))}
              </DataList>
            )}
          </Section>

          <SupportAgentWidget accent="primary" />
        </main>

        <CustomerTabBar />
      </div>
    </RotaryDial>
  );
}
