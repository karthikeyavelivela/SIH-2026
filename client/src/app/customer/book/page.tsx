'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { useSavedAddresses } from '@/lib/useSavedAddresses';
import { distanceKm } from '@/lib/geo';
import { Button } from '@/components/ui/Button';
import { AddressField, GeoPoint } from '@/components/booking/AddressField';
import { AddressChips } from '@/components/booking/AddressChips';
import { Skeleton } from '@/components/ui/Skeleton';
import { TruckIcon, BoxIcon, LayersIcon, CompassIcon, AlertIcon } from '@/components/ui/icons';

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

// Launch region is fixed for Phase 2 — there's no multi-region picker yet
// (that's Phase 5's /admin/regions), and every seeded FareRule is scoped
// to this one region.
const REGION = 'Visakhapatnam';

const TYPES: { value: BookingType; label: string; icon: typeof TruckIcon }[] = [
  { value: 'truck', label: 'Truck', icon: TruckIcon },
  { value: 'hamali', label: 'Hamali', icon: BoxIcon },
  { value: 'combo', label: 'Combo', icon: LayersIcon },
];

interface FareBreakdown {
  baseFare: number;
  distanceFare: number;
  hamaliFare: number;
  surgeMultiplier: number;
  total: number;
}

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-ip-input border border-ip-outline/25 bg-ip-surface-container-lowest text-ip-on-surface placeholder:text-ip-on-surface-variant/60 transition-colors duration-fast focus:border-ip-primary focus:ring-2 focus:ring-ip-primary/20';

function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="inline-flex items-center rounded-ip-input border border-ip-outline/25 overflow-hidden">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-11 h-11 flex items-center justify-center text-lg font-semibold text-ip-on-surface hover:bg-ip-surface-container transition-colors duration-fast disabled:opacity-40"
        disabled={value <= min}
      >
        &minus;
      </button>
      <span className="w-12 text-center font-heading font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(value + 1)}
        className="w-11 h-11 flex items-center justify-center text-lg font-semibold text-ip-on-surface hover:bg-ip-surface-container transition-colors duration-fast"
      >
        +
      </button>
    </div>
  );
}

function FareCard({
  state,
  fare,
  errorMessage,
}: {
  state: 'idle' | 'loading' | 'ready' | 'error';
  fare: FareBreakdown | null;
  errorMessage: string | null;
}) {
  if (state === 'idle') {
    return (
      <div className="text-center py-6 text-ip-body-sm text-ip-on-surface-variant">
        Add pickup, drop, and load details to see your fare.
      </div>
    );
  }
  if (state === 'loading') {
    return (
      <div className="ip-card">
        <Skeleton lines={3} className="h-4" />
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="rounded-ip-card bg-ip-error-container text-ip-on-error-container text-sm p-ip-md">
        {errorMessage ?? 'Could not estimate a fare for this trip.'}
      </div>
    );
  }
  if (!fare) return null;
  return (
    <div className="ip-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-ip-on-surface-variant mb-3">Fare estimate</p>
      <div className="space-y-1.5 text-sm">
        {fare.baseFare > 0 && (
          <div className="flex justify-between">
            <span className="text-ip-on-surface-variant">Base fare</span>
            <span>₹{fare.baseFare}</span>
          </div>
        )}
        {fare.distanceFare > 0 && (
          <div className="flex justify-between">
            <span className="text-ip-on-surface-variant">Distance</span>
            <span>₹{fare.distanceFare}</span>
          </div>
        )}
        {fare.hamaliFare > 0 && (
          <div className="flex justify-between">
            <span className="text-ip-on-surface-variant">Hamali labor</span>
            <span>₹{fare.hamaliFare}</span>
          </div>
        )}
        {fare.surgeMultiplier > 1 && (
          <div className="flex justify-between text-ip-primary">
            <span>Surge</span>
            <span>×{fare.surgeMultiplier}</span>
          </div>
        )}
        <div className="flex justify-between pt-2.5 mt-1 border-t border-ip-outline/10">
          <span className="font-heading font-bold text-ip-on-surface">Total</span>
          <span className="font-heading font-bold text-lg text-ip-on-surface tabular-nums">₹{fare.total}</span>
        </div>
      </div>
    </div>
  );
}

function BookForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialType = (params.get('type') as BookingType) ?? 'truck';

  const [type, setType] = useState<BookingType>(initialType);
  // Next's App Router soft-navigates within the same route on a
  // search-param-only URL change, so it does NOT remount this component —
  // useState's initial value only applies on first mount. Without this,
  // clicking "Hamali" from the dashboard after already having visited
  // /customer/book this session silently kept whatever type tab was last
  // selected: the URL said ?type=hamali, the UI showed a stale tab.
  useEffect(() => {
    setType(initialType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialType]);
  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);
  const [weightKg, setWeightKg] = useState('');
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
  const quoteDebounce = useRef<ReturnType<typeof setTimeout>>();

  const needsWeight = type !== 'hamali';
  const needsHamali = type !== 'truck';
  const weightValid = !needsWeight || Number(weightKg) > 0;
  const readyToQuote = pickup && drop && weightValid && (!needsHamali || hamaliCount > 0);

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
          region: REGION,
          pickupLocation: { coordinates: [pickup!.lng, pickup!.lat], address: pickup!.address },
          dropLocation: { coordinates: [drop!.lng, drop!.lat], address: drop!.address },
          requiredVehicles: needsWeight ? [{ capacityKg: Number(weightKg), count: 1 }] : [],
          requiredHamaliCount: needsHamali ? hamaliCount : 0,
        });
        setFare(res.fareBreakdown);
        setFareState('ready');
      } catch (err) {
        setFareError(
          err instanceof ApiClientError
            ? err.message
            : 'Could not estimate a fare — check your connection and try again.'
        );
        setFareState('error');
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 450);

    return () => clearTimeout(quoteDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, pickup, drop, weightKg, hamaliCount, needsWeight, needsHamali, readyToQuote]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickup || !drop) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ booking: { _id: string } }>('/api/bookings', {
        type,
        region: REGION,
        cargoDetails: { weightKg: needsWeight ? Number(weightKg) : 0 },
        pickupLocation: { coordinates: [pickup.lng, pickup.lat], address: pickup.address },
        dropLocation: { coordinates: [drop.lng, drop.lat], address: drop.address },
        requiredVehicles: needsWeight ? [{ capacityKg: Number(weightKg), count: 1 }] : [],
        requiredHamaliCount: needsHamali ? hamaliCount : 0,
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
      });
      router.push(`/customer/track/${res.booking._id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : 'Could not create this booking. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-ip-surface">
      <div className="max-w-lg mx-auto px-ip-edge pt-ip-lg pb-ip-xl">
        <h1 className="font-heading font-extrabold text-ip-display-md text-ip-on-surface mb-1">Book a delivery</h1>
        <p className="text-ip-body-md text-ip-on-surface-variant mb-6">Trucks, Hamali labor, or both — in {REGION}.</p>

        <div
          className="grid grid-cols-3 gap-2 mb-6 p-1.5 rounded-ip-card bg-ip-surface-container"
          role="radiogroup"
          aria-label="Booking type"
        >
          {TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={type === t.value}
              onClick={() => setType(t.value)}
              className={`flex flex-col items-center gap-1 py-2.5 rounded-ip-input text-xs font-semibold transition-all duration-fast ${
                type === t.value ? 'bg-ip-primary text-ip-on-primary' : 'text-ip-on-surface-variant hover:bg-ip-surface-container-high'
              }`}
            >
              <t.icon className="w-5 h-5" />
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="ip-card space-y-4">
            <div>
              <AddressField
                label="Pickup"
                placeholder="Where should we collect from?"
                value={pickup}
                onChange={setPickup}
                markerColorClass="text-ip-primary"
              />
              {locatingDevice && (
                <p className="flex items-center gap-1.5 text-xs text-ip-on-surface-variant mt-2">
                  <CompassIcon className="w-3.5 h-3.5 animate-pulse" />
                  Finding your current location…
                </p>
              )}
              <AddressChips
                saved={savedAddresses}
                onPick={setPickup}
                currentValue={pickup}
                onSave={(label, point) => saveAddress(label, point.address, point.lat, point.lng)}
              />
              {mismatch && (
                <div className="mt-2 flex items-start gap-2.5 rounded-ip-input bg-amber-100/70 px-3.5 py-2.5 text-sm text-amber-900">
                  <AlertIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="mb-1.5">This pickup doesn&apos;t match your current location — is it for you or someone else?</p>
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
                        It&apos;s me — use my location
                      </button>
                      <button
                        type="button"
                        className="font-semibold underline"
                        onClick={() => setMismatchDismissedFor(pickup!.address)}
                      >
                        It&apos;s for someone else
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div>
              <AddressField
                label="Drop"
                placeholder="Where is this headed?"
                value={drop}
                onChange={setDrop}
                markerColorClass="text-ip-secondary"
              />
              <AddressChips
                saved={savedAddresses}
                onPick={setDrop}
                currentValue={drop}
                onSave={(label, point) => saveAddress(label, point.address, point.lat, point.lng)}
                extraChip={
                  type === 'hamali' && pickup ? { label: 'Same as pickup', onClick: () => setDrop(pickup) } : undefined
                }
              />
            </div>
          </div>

          {pickup && drop && (
            <div className="rounded-ip-card overflow-hidden">
              <RouteMap
                pickup={{ lat: pickup.lat, lng: pickup.lng }}
                drop={{ lat: drop.lat, lng: drop.lng }}
                className="h-48"
              />
            </div>
          )}

          {needsWeight && (
            <div className="ip-card">
              <label className="block text-xs font-semibold text-ip-on-surface-variant mb-1.5" htmlFor="weight">
                Cargo weight (kg)
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
            </div>
          )}

          {needsHamali && (
            <div className="ip-card flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-ip-on-surface">Hamali workers</p>
                <p className="text-xs text-ip-on-surface-variant">How many hands do you need?</p>
              </div>
              <Stepper value={hamaliCount} onChange={setHamaliCount} />
            </div>
          )}

          <div className="ip-card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ip-on-surface">When</p>
              <div className="flex rounded-ip-pill bg-ip-surface-container p-1" role="radiogroup" aria-label="Booking timing">
                <button
                  type="button"
                  role="radio"
                  aria-checked={!scheduledFor}
                  onClick={() => setScheduledFor('')}
                  className={`px-3 py-1.5 rounded-ip-pill text-xs font-semibold transition-colors ${!scheduledFor ? 'bg-ip-primary text-ip-on-primary' : 'text-ip-on-surface-variant'}`}
                >
                  Now
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={!!scheduledFor}
                  onClick={() => setScheduledFor((v) => v || scheduleBounds.min)}
                  className={`px-3 py-1.5 rounded-ip-pill text-xs font-semibold transition-colors ${scheduledFor ? 'bg-ip-primary text-ip-on-primary' : 'text-ip-on-surface-variant'}`}
                >
                  Schedule
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
                  className="w-full min-h-[44px] px-3.5 rounded-ip-input border border-ip-outline/20 bg-ip-surface text-sm"
                />
                <p className="text-xs text-ip-on-surface-variant mt-1.5">
                  We&apos;ll start finding a match closer to this time, not immediately.
                </p>
              </>
            )}
          </div>

          <FareCard state={fareState} fare={fare} errorMessage={fareError} />

          {submitError && (
            <div role="alert" className="rounded-ip-card bg-ip-error-container text-ip-on-error-container px-4 py-3 text-sm">
              {submitError}
            </div>
          )}

          <Button type="submit" disabled={submitting || fareState !== 'ready'} className="w-full" size="lg">
            {submitting ? 'Booking…' : fare ? `Confirm — ₹${fare.total}` : 'Confirm booking'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function CustomerBookPage() {
  return (
    <Suspense fallback={null}>
      <BookForm />
    </Suspense>
  );
}
