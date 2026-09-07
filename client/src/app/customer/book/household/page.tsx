'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { bucketCategories } from '@/lib/categoryBuckets';
import { distanceKm } from '@/lib/geo';
import { Button } from '@/components/ui/Button';
import { AddressField, GeoPoint } from '@/components/booking/AddressField';
import { AddressChips } from '@/components/booking/AddressChips';
import { PricingQuoteWidget } from '@/components/worker/AgentWidgets';
import { FareCard, bucketVehicleCategory, type FareBreakdown } from '@/components/booking/FareCard';
import { CategoryPicker, type ServiceCategory } from '@/components/booking/CategoryPicker';
import { StatusPill } from '@/components/ui/StatusPill';
import { Icon } from '@/components/ui/Icon';
import { Media } from '@/components/ui/Media';
import { RotaryDial, type DialSector } from '@/components/ui/RotaryDial';

// How far a selected pickup can be from the device's GPS reading before we
// ask "is this pickup for you or someone else?" — big enough that normal
// GPS drift/inaccuracy never triggers it, small enough to catch "I typed
// my office's address by habit but I'm actually at home right now".
const MISMATCH_KM = 2;

// Matches the server's MIN_LEAD_MS/MAX_LEAD_MS in booking.controller.ts's
// createBooking exactly — this only sets the picker's bounds; the server
// re-validates regardless of what the client sends.
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultScheduledForValue(): string {
  return toDatetimeLocalValue(new Date(Date.now() + 35 * 60 * 1000));
}
function maxScheduledForValue(): string {
  return toDatetimeLocalValue(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
}

// react-leaflet touches `window` at module load — must never run during
// Next's server render pass.
const RouteMap = dynamic(() => import('@/components/map/RouteMap'), { ssr: false });

type BookingType = 'truck' | 'hamali' | 'combo';

// SIH26089 pan-India rewrite — region is no longer a fixed constant. It's
// derived from the pickup point's own geocoded district/city (see
// AddressField.tsx / geocode.service.ts's extractRegion), so a booking
// prices against wherever the customer actually is, not a hardcoded
// launch city. A region with no active FareRule yet surfaces the server's
// existing honest "No active fare rule for {region}/{category}" error
// (booking.controller.ts) rather than silently pricing at someone else's
// rate.
const FALLBACK_REGION_LABEL = 'your area';

// Matches booking.routes.ts's server-side ceiling on body('stops').
const MAX_STOPS = 5;

// There's no backend concept of "bulk tonnage" — hamali bookings are
// counted in WORKERS, not weight, and no multi-society dispatch endpoint
// exists (checked server-side before building this). Past this many
// requested workers, a single crew almost certainly can't cover it from
// one society, so we say so honestly instead of pretending an automatic
// multi-crew assembly flow exists — the booking still submits normally,
// operations coordinates the rest manually. See DESIGN_MAP.md's open
// question #1.
const LARGE_CREW_THRESHOLD = 15;

// Real Rs 50,000 e-way-bill threshold (CGST Rules, rule 138) — value-based,
// not weight-based, hence gated on estimatedValueRupees below.
const EWAY_BILL_THRESHOLD_RUPEES = 50000;

// Mirrors server/src/models/Booking.ts's GOODS_TYPES exactly — a small
// fixed list, hardcoded here rather than fetched, same precedent the
// marketing homepage's SERVICE_CATEGORY_DISPLAY already sets.
const GOODS_TYPES = [
  'general_goods', 'electronics', 'furniture', 'household_shifting',
  'perishables', 'construction_material', 'industrial_machinery',
  'documents_parcels', 'other',
] as const;

const DIAL_SECTORS: DialSector[] = [
  { key: 'household', label: 'Household', glyph: 'home_repair_service' },
  { key: 'labour', label: 'Hamali', glyph: 'engineering' },
  { key: 'transport', label: 'Transit', glyph: 'local_shipping' },
];

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-control border border-fy-muted/25 bg-fy-card text-fy-ink placeholder:text-fy-ink-soft/60 transition-colors duration-fast focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/20';

function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  const t = useTranslations('customerBook');
  return (
    <div className="inline-flex items-center rounded-control border border-fy-muted/25 overflow-hidden">
      <button
        type="button"
        aria-label={t('decreaseAria')}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-11 h-11 flex items-center justify-center text-lg font-semibold text-fy-ink hover:bg-fy-field transition-colors duration-fast disabled:opacity-40"
        disabled={value <= min}
      >
        &minus;
      </button>
      <span className="w-12 text-center font-heading font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={t('increaseAria')}
        onClick={() => onChange(value + 1)}
        className="w-11 h-11 flex items-center justify-center text-lg font-semibold text-fy-ink hover:bg-fy-field transition-colors duration-fast"
      >
        +
      </button>
    </div>
  );
}

function BookForm() {
  const t = useTranslations('customerBook');
  const router = useRouter();
  const params = useSearchParams();
  function handleDialChange(key: string) {
    if (key === 'household') router.push('/customer/dashboard');
    else if (key === 'labour') router.push('/customer/book/labour');
    else if (key === 'transport') router.push('/customer/book/transport');
  }
  // Household is always a hamali-dispatch job (every named trade —
  // electrician, plumber, ... — rides dispatchType:'hamali' per
  // seedServiceCategories.ts) — never a customer-facing truck/combo
  // choice here, unlike the old shared form. See /customer/book/transport
  // and /customer/book/labour for the other two dispatch types.
  const type: BookingType = 'hamali';

  // SIH26089 Phase C — the specific ServiceCategory chosen (electrician,
  // plumber, ...). serviceCategorySlug rides along on the quote/create
  // payload purely as metadata — the server re-derives `type` from it
  // itself, never trusts the client's own `type` when a category is
  // present. Prefilled from ?category= (the dashboard's category-grid
  // links carry this) once the real household category list loads.
  const [selectedCategory, setSelectedCategory] = useState<ServiceCategory | null>(null);
  const categoriesState = useApiState(
    () => api.get<{ categories: ServiceCategory[] }>('/api/service-categories').then((r) => r.categories),
    []
  );
  const householdCategories = useMemo(
    () => bucketCategories(categoriesState.data ?? []).household,
    [categoriesState.data]
  );
  useEffect(() => {
    const wantedSlug = params.get('category');
    if (!wantedSlug || selectedCategory) return;
    const match = householdCategories.find((c) => c.slug === wantedSlug);
    if (match) setSelectedCategory(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, householdCategories]);

  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);
  // Phase 6.3 — ordered intermediate stops, capped at MAX_STOPS to match
  // the server's own abuse ceiling (booking.routes.ts).
  const [stops, setStops] = useState<GeoPoint[]>([]);
  const [weightKg, setWeightKg] = useState('');
  // SIH26089 — what's being moved, for a truck/combo booking. All three
  // optional/self-declared; ewayBillNumber's field only shows once
  // estimatedValueRupees crosses the real Rs 50,000 e-way-bill threshold
  // (CGST Rules, rule 138) — value-based, not weight-based.
  const [goodsType, setGoodsType] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [ewayBillNumber, setEwayBillNumber] = useState('');
  // Computed once on mount, not inline in JSX — calling
  // defaultScheduledForValue()/maxScheduledForValue() fresh on every render
  // means `min` keeps creeping forward as real time passes while the form
  // is being filled out, which can invalidate a value the user already
  // picked (native datetime-local validation then silently blocks submit
  // with no error shown anywhere in our own UI). Found live: pick a
  // schedule time, spend a few seconds on the rest of the form, hit
  // Confirm — nothing happens because `min` had already drifted past the
  // selected value.
  const [scheduleBounds] = useState(() => ({ min: defaultScheduledForValue(), max: maxScheduledForValue() }));
  const [hamaliCount, setHamaliCount] = useState(1);
  const { addresses: savedAddresses, save: saveAddress } = useSavedAddresses();

  // Device GPS as the default pickup — requested once on mount (the real
  // browser permission prompt fires here), reverse-geocoded to a human
  // address. Silent on denial/error: the field just stays empty and the
  // customer types normally, same "don't fail loudly for something that
  // doesn't block the core flow" principle as OnlineToggle/live-location.
  const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingDevice, setLocatingDevice] = useState(true);
  // Keyed on the pickup address that was dismissed, not a plain boolean —
  // switching to a DIFFERENT mismatched address should re-surface the
  // check rather than staying silenced from the first dismissal.
  const [mismatchDismissedFor, setMismatchDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setLocatingDevice(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDeviceLocation(loc);
        try {
          const res = await api.get<{ result: { lat: number; lon: number; displayName: string } | null }>(
            `/api/geocode/reverse?lat=${loc.lat}&lng=${loc.lng}`
          );
          if (res.result) {
            setPickup((current) => current ?? { lat: res.result!.lat, lng: res.result!.lon, address: res.result!.displayName });
          }
        } catch {
          // Reverse geocode failed — device location is still known for the
          // mismatch check below, pickup just isn't prefilled.
        } finally {
          setLocatingDevice(false);
        }
      },
      () => setLocatingDevice(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
    // Deliberately once on mount only — re-firing on every render would
    // re-prompt/re-fetch pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mismatch =
    deviceLocation &&
    pickup &&
    mismatchDismissedFor !== pickup.address &&
    distanceKm(deviceLocation, { lat: pickup.lat, lng: pickup.lng }) > MISMATCH_KM;

  const [fareState, setFareState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [fare, setFare] = useState<FareBreakdown | null>(null);
  const [fareError, setFareError] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Phase 6 — scheduled booking. '' = instant (matches API's "absent =
  // instant" contract exactly — never send an empty string as scheduledFor).
  const [scheduledFor, setScheduledFor] = useState('');
  // Phase 6.2 — load board with bidding. Only meaningful for truck/hamali
  // (never combo — see Booking.openForBidding's server-side doc comment)
  // and only for an instant booking (never combined with scheduledFor,
  // enforced again server-side in createBooking).
  const [openForBidding, setOpenForBidding] = useState(false);
  const quoteDebounce = useRef<ReturnType<typeof setTimeout>>();

  // Always true/false respectively — household is always hamali-dispatch
  // (no cargo weight/goods/e-way fields, always needs worker headcount).
  // Hardcoded rather than derived from `type` since `type` is now a fixed
  // literal, which made the derived comparisons below dead by construction.
  const needsWeight = false;
  const needsHamali = true;
  const weightValid = !needsWeight || Number(weightKg) > 0;
  const stopsFilled = stops.every((s) => s.address);
  // Region always comes from wherever the job actually is (pickup), never
  // drop — a fare is priced/dispatched at the pickup end. Deliberately NOT
  // gated on region being non-empty: an address the geocoder couldn't
  // extract a district/city for still submits a quote request, so the
  // server's own "No active fare rule for {region}/{category}" (422)
  // surfaces as a real, honest error instead of the form silently never
  // reaching a fare at all.
  // Visible + correctable region (Phase 1.2 requirement): the geocoder's
  // derived region seeds this, but the server only ever sees a plain
  // string (body('region').isString().trim() — no cross-check against
  // pickup's own coordinates), so letting the customer override it here is
  // real, not cosmetic. Re-syncs from a new pickup UNLESS the customer has
  // already edited it by hand.
  const [regionOverride, setRegionOverride] = useState('');
  const [regionTouched, setRegionTouched] = useState(false);
  const [editingRegion, setEditingRegion] = useState(false);
  useEffect(() => {
    if (!regionTouched) setRegionOverride(pickup?.region ?? '');
  }, [pickup?.region, regionTouched]);
  const region = regionOverride;
  const readyToQuote = pickup && drop && weightValid && stopsFilled && (!needsHamali || hamaliCount > 0);
  const ewayRequired = needsWeight && Number(estimatedValue) >= EWAY_BILL_THRESHOLD_RUPEES;

  useEffect(() => {
    clearTimeout(quoteDebounce.current);
    setFare(null);

    if (!readyToQuote) {
      setFareState('idle');
      return;
    }

    setFareState('loading');
    quoteDebounce.current = setTimeout(async () => {
      try {
        const res = await api.post<{ fareBreakdown: FareBreakdown }>('/api/bookings/quote', {
          type,
          region,
          pickupLocation: { coordinates: [pickup!.lng, pickup!.lat], address: pickup!.address },
          dropLocation: { coordinates: [drop!.lng, drop!.lat], address: drop!.address },
          stops: stops.map((s) => ({ coordinates: [s.lng, s.lat], address: s.address })),
          requiredVehicles: needsWeight ? [{ capacityKg: Number(weightKg), count: 1 }] : [],
          requiredHamaliCount: needsHamali ? hamaliCount : 0,
          serviceCategorySlug: selectedCategory?.slug,
        });
        setFare(res.fareBreakdown);
        setFareState('ready');
      } catch (err) {
        setFareError(
          err instanceof ApiClientError
            ? err.message
            : t('errorFareEstimate')
        );
        setFareState('error');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 450);

    return () => clearTimeout(quoteDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, pickup, drop, stops, weightKg, hamaliCount, needsWeight, needsHamali, readyToQuote, selectedCategory, region]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup || !drop) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ booking: { _id: string } }>('/api/bookings', {
        type,
        region,
        cargoDetails: {
          weightKg: needsWeight ? Number(weightKg) : 0,
          goodsType: needsWeight && goodsType ? goodsType : undefined,
          estimatedValueRupees: needsWeight && estimatedValue ? Number(estimatedValue) : undefined,
          ewayBillNumber: needsWeight && ewayRequired && ewayBillNumber ? ewayBillNumber : undefined,
        },
        pickupLocation: { coordinates: [pickup.lng, pickup.lat], address: pickup.address },
        dropLocation: { coordinates: [drop.lng, drop.lat], address: drop.address },
        stops: stops.map((s) => ({ coordinates: [s.lng, s.lat], address: s.address })),
        requiredVehicles: needsWeight ? [{ capacityKg: Number(weightKg), count: 1 }] : [],
        requiredHamaliCount: needsHamali ? hamaliCount : 0,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        openForBidding: true /* household is never combo */ && !scheduledFor ? openForBidding : undefined,
        serviceCategorySlug: selectedCategory?.slug,
      });
      router.push(`/customer/track/${res.booking._id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : t('errorSubmit'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RotaryDial sectors={DIAL_SECTORS} activeKey="household" onChange={handleDialChange}>
    <div className="min-h-screen bg-fy-bone">
      <div className="max-w-lg mx-auto px-gutter pt-8 pb-12">
        <h1 className="font-heading font-extrabold text-heading text-fy-ink mb-1">{t('title')}</h1>
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <p className="text-body text-fy-ink-soft">{t('subtitle', { region: region || FALLBACK_REGION_LABEL })}</p>
          {editingRegion ? (
            <input
              autoFocus
              value={regionOverride}
              onChange={(e) => { setRegionOverride(e.target.value); setRegionTouched(true); }}
              onBlur={() => setEditingRegion(false)}
              onKeyDown={(e) => e.key === 'Enter' && setEditingRegion(false)}
              placeholder={FALLBACK_REGION_LABEL}
              className="min-w-0 w-40 px-2.5 py-1 rounded-full border border-fy-ink/25 bg-white text-sm font-semibold text-fy-ink"
            />
          ) : (
            <button type="button" onClick={() => setEditingRegion(true)} className="inline-flex">
              <StatusPill tone="transport" dot>
                {region || FALLBACK_REGION_LABEL} · {t('editRegion')}
              </StatusPill>
            </button>
          )}
        </div>

        {selectedCategory && (
          <div className="relative w-full h-40 rounded-card overflow-hidden mb-4 shadow-md bg-fy-brown">
            <Media
              id={`household.category.${selectedCategory.slug}`}
              kind="photo"
              aspect={2.5}
              treatment="full-bleed"
              tint="household"
              alt={selectedCategory.name}
              className="w-full h-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-fy-brown via-fy-brown/40 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h3 className="font-heading text-title text-white leading-snug">{selectedCategory.name}</h3>
            </div>
          </div>
        )}

        <CategoryPicker
          selectedSlug={selectedCategory?.slug ?? null}
          categories={householdCategories}
          onSelect={(category) => setSelectedCategory(category)}
        />

        {selectedCategory && (
          <p className="text-xs text-fy-ink-soft -mt-4 mb-6">
            {t('categorySelected', { name: selectedCategory.name })}
          </p>
        )}

        <form id="book-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="fy-surface-card space-y-4">
            <div>
              <AddressField
                label={t('pickupLabel')}
                placeholder={t('pickupPlaceholder')}
                value={pickup}
                onChange={setPickup}
                markerColorClass="text-fy-brown"
              />
              {locatingDevice && (
                <p className="flex items-center gap-1.5 text-xs text-fy-ink-soft mt-2">
                  <Icon name="explore" size={14} className="animate-pulse" />
                  {t('findingLocation')}
                </p>
              )}
              <AddressChips
                saved={savedAddresses}
                onPick={setPickup}
                currentValue={pickup}
                onSave={(label, point) => saveAddress(label, point.address, point.lat, point.lng)}
              />
              {mismatch && (
                <div className="mt-2 flex items-start gap-2.5 rounded-control bg-amber-100/70 px-3.5 py-2.5 text-sm text-amber-900">
                  <Icon name="warning" size={16} className="mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="mb-1.5">{t('mismatchText')}</p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={async () => {
                          if (!deviceLocation) return;
                          try {
                            const res = await api.get<{ result: { lat: number; lon: number; displayName: string } | null }>(
                              `/api/geocode/reverse?lat=${deviceLocation.lat}&lng=${deviceLocation.lng}`
                            );
                            if (res.result) setPickup({ lat: res.result.lat, lng: res.result.lon, address: res.result.displayName });
                          } catch {
                            // Leave the typed address in place — same "don't fail loudly" fallback as elsewhere.
                          }
                        }}
                      >
                        {t('mismatchUseMyLocation')}
                      </button>
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => setMismatchDismissedFor(pickup!.address)}
                      >
                        {t('mismatchSomeoneElse')}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {stops.map((stop, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <AddressField
                    label={t('stopLabel', { n: i + 1 })}
                    placeholder={t('stopPlaceholder')}
                    value={stop}
                    onChange={(v) => v && setStops((prev) => prev.map((s, idx) => (idx === i ? v : s)))}
                    markerColorClass="text-fy-ink-soft"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setStops((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={t('removeStopAria', { n: i + 1 })}
                  className="min-h-[44px] px-3 text-xs font-semibold text-fy-error"
                >
                  {t('removeStop')}
                </button>
              </div>
            ))}

            {stops.length < MAX_STOPS && (
              <button
                type="button"
                onClick={() => setStops((prev) => [...prev, { lat: 0, lng: 0, address: '' }])}
                className="text-xs font-semibold text-fy-brown text-left"
              >
                + {t('addStop')}
              </button>
            )}

            <div>
              <AddressField
                label={t('dropLabel')}
                placeholder={t('dropPlaceholder')}
                value={drop}
                onChange={setDrop}
                markerColorClass="text-fy-green"
              />
              <AddressChips
                saved={savedAddresses}
                onPick={setDrop}
                currentValue={drop}
                onSave={(label, point) => saveAddress(label, point.address, point.lat, point.lng)}
                extraChip={
                  type === 'hamali' && pickup ? { label: t('sameAsPickup'), onClick: () => setDrop(pickup) } : undefined
                }
              />
            </div>
          </div>

          {pickup && drop && (
            <div className="rounded-card overflow-hidden">
              <RouteMap
                pickup={{ lat: pickup.lat, lng: pickup.lng }}
                drop={{ lat: drop.lat, lng: drop.lng }}
                stops={stops.filter((s) => s.address).map((s) => ({ lat: s.lat, lng: s.lng }))}
                className="h-48"
              />
            </div>
          )}

          {needsWeight && (
            <div className="fy-surface-card">
              <label className="block text-xs font-semibold text-fy-ink-soft mb-1.5" htmlFor="weight">
                {t('cargoWeightLabel')}
              </label>
              <input
                id="weight"
                type="number"
                placeholder="e.g. 800"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className={inputClass}
                required
                min={1}
              />

              <label className="block text-xs font-semibold text-fy-ink-soft mb-1.5 mt-4" htmlFor="goodsType">
                {t('goodsTypeLabel')}
              </label>
              <select
                id="goodsType"
                value={goodsType}
                onChange={(e) => setGoodsType(e.target.value)}
                className={inputClass}
              >
                <option value="">{t('goodsTypePlaceholder')}</option>
                {GOODS_TYPES.map((g) => (
                  <option key={g} value={g}>
                    {t(`goodsTypes.${g}` as never)}
                  </option>
                ))}
              </select>

              <label className="block text-xs font-semibold text-fy-ink-soft mb-1.5 mt-4" htmlFor="estimatedValue">
                {t('estimatedValueLabel')}
              </label>
              <input
                id="estimatedValue"
                type="number"
                placeholder="e.g. 25000"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
                className={inputClass}
                min={0}
              />

              {ewayRequired && (
                <div className="mt-4">
                  <label className="block text-xs font-semibold text-fy-ink-soft mb-1.5" htmlFor="ewayBill">
                    {t('ewayBillLabel')}
                  </label>
                  <input
                    id="ewayBill"
                    type="text"
                    placeholder={t('ewayBillPlaceholder')}
                    value={ewayBillNumber}
                    onChange={(e) => setEwayBillNumber(e.target.value)}
                    className={inputClass}
                  />
                  <p className="text-[11px] text-fy-ink-soft mt-1.5">{t('ewayBillHint')}</p>
                </div>
              )}
            </div>
          )}

          {needsHamali && (
            <div className="fy-surface-card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-fy-ink">{t('hamaliWorkersTitle')}</p>
                  <p className="text-xs text-fy-ink-soft">{t('hamaliWorkersHint')}</p>
                </div>
                <Stepper value={hamaliCount} onChange={setHamaliCount} />
              </div>
              {hamaliCount >= LARGE_CREW_THRESHOLD && (
                <p className="mt-3 pt-3 border-t border-fy-muted/10 text-xs text-fy-ink-soft">
                  {t('largeCrewNotice')}
                </p>
              )}
            </div>
          )}

          <div className="fy-surface-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-fy-ink">{t('whenLabel')}</p>
              <div className="flex rounded-full bg-fy-field p-1" role="radiogroup" aria-label="Booking timing">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!scheduledFor}
                  onClick={() => setScheduledFor('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${!scheduledFor ? 'bg-fy-brown text-fy-on-brown' : 'text-fy-ink-soft'}`}
                >
                  {t('now')}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!!scheduledFor}
                  onClick={() => setScheduledFor((v) => v || scheduleBounds.min)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${scheduledFor ? 'bg-fy-brown text-fy-on-brown' : 'text-fy-ink-soft'}`}
                >
                  {t('schedule')}
                </button>
              </div>
            </div>
            {scheduledFor && (
              <>
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  min={scheduleBounds.min}
                  max={scheduleBounds.max}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 rounded-control border border-fy-muted/20 bg-fy-bone text-sm"
                />
                <p className="text-xs text-fy-ink-soft mt-1.5">{t('scheduleHint')}</p>
              </>
            )}
          </div>

          <FareCard state={fareState} fare={fare} errorMessage={fareError} />

          {true /* household is never combo */ && !scheduledFor && (
            <label className="fy-surface-card flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={openForBidding}
                onChange={(e) => setOpenForBidding(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-fy-muted/40 text-fy-brown focus:ring-fy-brown/30"
              />
              <div>
                <p className="text-sm font-semibold text-fy-ink">{t('biddingTitle')}</p>
                <p className="text-xs text-fy-ink-soft">{t('biddingHint')}</p>
              </div>
            </label>
          )}

          {fareState === 'ready' && pickup && drop && (
            <PricingQuoteWidget
              region={region}
              category={type === 'hamali' ? 'hamali' : bucketVehicleCategory(Number(weightKg) || 1)}
              distanceKm={distanceKm(pickup, drop)}
              hamaliCount={needsHamali ? hamaliCount : undefined}
            />
          )}

          {submitError && (
            <div role="alert" className="rounded-card bg-fy-error-bg text-fy-on-error-bg px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          {/* Spacer so the sticky CTA bar + BottomTabNav below never cover the last field. */}
          <div className="h-36" aria-hidden="true" />
        </form>
      </div>

      {/* Sticky bottom CTA bar — matches every Stitch booking-detail screen's
          fixed price+confirm strip instead of a plain inline button at the
          end of a long scroll. Offset above BottomTabNav (customer/layout.tsx,
          also `fixed bottom-0`, ~73px tall) rather than stacking on top of it. */}
      <div className="fixed bottom-[73px] inset-x-0 bg-fy-bone/95 backdrop-blur-xl shadow-[0_-4px_24px_rgba(0,0,0,0.06)] z-30 pb-4 pt-3 px-gutter">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          {fare && (
            <div className="flex flex-col shrink-0">
              <span className="font-body text-eyebrow text-fy-muted uppercase">{t('total')}</span>
              <span className="font-heading text-title text-fy-ink tabular-nums">₹{fare.total}</span>
            </div>
          )}
          <Button
            type="submit"
            form="book-form"
            disabled={submitting || fareState !== 'ready'}
            className="flex-1 h-12"
            size="lg"
          >
            {submitting
              ? t('booking')
              : openForBidding && true /* household is never combo */ && !scheduledFor
                ? t('postForBidding')
                : t('confirmBooking')}
          </Button>
        </div>
      </div>
    </div>
    </RotaryDial>
  );
}

export default function CustomerBookPage() {
  return (
    <Suspense fallback={null}>
      <BookForm />
    </Suspense>
  );
}
