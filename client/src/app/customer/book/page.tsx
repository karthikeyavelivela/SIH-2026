'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AddressField, GeoPoint } from '@/components/booking/AddressField';
import { TruckIcon, BoxIcon, LayersIcon } from '@/components/ui/icons';

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
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

function Stepper({ value, onChange, min = 1 }: { value: number; onChange: (n: number) => void; min?: number }) {
  return (
    <div className="inline-flex items-center rounded-md border border-border overflow-hidden">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-11 h-11 flex items-center justify-center text-lg font-semibold text-text-primary hover:bg-surface transition-colors duration-fast disabled:opacity-40"
        disabled={value <= min}
      >
        &minus;
      </button>
      <span className="w-12 text-center font-heading font-bold tabular-nums">{value}</span>
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(value + 1)}
        className="w-11 h-11 flex items-center justify-center text-lg font-semibold text-text-primary hover:bg-surface transition-colors duration-fast"
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
      <Card elevation="flat" className="text-center py-6 text-sm text-text-muted">
        Add pickup, drop, and load details to see your fare.
      </Card>
    );
  }
  if (state === 'loading') {
    return (
      <Card elevation="raised" className="space-y-2.5">
        <div className="h-4 w-24 rounded bg-surface animate-pulse" />
        <div className="h-4 w-full rounded bg-surface animate-pulse" />
        <div className="h-4 w-2/3 rounded bg-surface animate-pulse" />
      </Card>
    );
  }
  if (state === 'error') {
    return (
      <Card elevation="raised" className="text-sm text-red-700 bg-red-50 border-red-200">
        {errorMessage ?? 'Could not estimate a fare for this trip.'}
      </Card>
    );
  }
  if (!fare) return null;
  return (
    <Card elevation="raised">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-3">Fare estimate</p>
      <div className="space-y-1.5 text-sm">
        {fare.baseFare > 0 && (
          <div className="flex justify-between">
            <span className="text-text-muted">Base fare</span>
            <span>₹{fare.baseFare}</span>
          </div>
        )}
        {fare.distanceFare > 0 && (
          <div className="flex justify-between">
            <span className="text-text-muted">Distance</span>
            <span>₹{fare.distanceFare}</span>
          </div>
        )}
        {fare.hamaliFare > 0 && (
          <div className="flex justify-between">
            <span className="text-text-muted">Hamali labor</span>
            <span>₹{fare.hamaliFare}</span>
          </div>
        )}
        {fare.surgeMultiplier > 1 && (
          <div className="flex justify-between text-primary-600">
            <span>Surge</span>
            <span>×{fare.surgeMultiplier}</span>
          </div>
        )}
        <div className="flex justify-between pt-2.5 mt-1 border-t border-border">
          <span className="font-heading font-bold">Total</span>
          <span className="font-heading font-bold text-lg">₹{fare.total}</span>
        </div>
      </div>
    </Card>
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
  const [hamaliCount, setHamaliCount] = useState(1);

  const [fareState, setFareState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [fare, setFare] = useState<FareBreakdown | null>(null);
  const [fareError, setFareError] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
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
      });
      router.push(`/customer/track/${res.booking._id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : 'Could not create this booking. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-1">Book a delivery</h1>
      <p className="text-sm text-text-muted mb-6">Trucks, Hamali labor, or both — in {REGION}.</p>

      <div
        className="grid grid-cols-3 gap-2 mb-6 p-1.5 rounded-lg border border-border bg-surface shadow-sm"
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
            className={`flex flex-col items-center gap-1 py-2.5 rounded-md text-xs font-semibold transition-all duration-fast ${
              type === t.value ? 'bg-primary-600 text-white shadow-md -translate-y-0.5' : 'text-text-muted hover:bg-surface-raised'
            }`}
          >
            <t.icon className="w-5 h-5" />
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card elevation="raised" className="space-y-4">
          <AddressField
            label="Pickup"
            placeholder="Where should we collect from?"
            value={pickup}
            onChange={setPickup}
            markerColorClass="text-primary-600"
          />
          <AddressField
            label="Drop"
            placeholder="Where is this headed?"
            value={drop}
            onChange={setDrop}
            markerColorClass="text-secondary-600"
          />
        </Card>

        {pickup && drop && (
          <RouteMap
            pickup={{ lat: pickup.lat, lng: pickup.lng }}
            drop={{ lat: drop.lat, lng: drop.lng }}
            className="h-48"
          />
        )}

        {needsWeight && (
          <Card elevation="raised">
            <label className="block text-xs font-semibold text-text-muted mb-1.5" htmlFor="weight">
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
          </Card>
        )}

        {needsHamali && (
          <Card elevation="raised" className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Hamali workers</p>
              <p className="text-xs text-text-muted">How many hands do you need?</p>
            </div>
            <Stepper value={hamaliCount} onChange={setHamaliCount} />
          </Card>
        )}

        <FareCard state={fareState} fare={fare} errorMessage={fareError} />

        {submitError && (
          <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <Button type="submit" disabled={submitting || fareState !== 'ready'} className="w-full" size="lg">
          {submitting ? 'Booking…' : fare ? `Confirm — ₹${fare.total}` : 'Confirm booking'}
        </Button>
      </form>
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
