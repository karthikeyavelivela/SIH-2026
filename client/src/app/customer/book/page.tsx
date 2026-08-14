'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TruckIcon, BoxIcon, LayersIcon } from '@/components/ui/icons';

type BookingType = 'truck' | 'hamali' | 'combo';

const TYPES: { value: BookingType; label: string; icon: typeof TruckIcon }[] = [
  { value: 'truck', label: 'Truck', icon: TruckIcon },
  { value: 'hamali', label: 'Hamali', icon: BoxIcon },
  { value: 'combo', label: 'Combo', icon: LayersIcon },
];

const inputClass =
  'w-full min-h-[44px] px-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20';

function BookForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialType = (params.get('type') as BookingType) ?? 'truck';

  const [type, setType] = useState<BookingType>(initialType);
  const [pickupAddress, setPickupAddress] = useState('');
  const [dropAddress, setDropAddress] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [hamaliCount, setHamaliCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ booking: { _id: string } }>('/api/bookings', {
        type,
        region: 'Visakhapatnam',
        cargoDetails: { weightKg: Number(weightKg) || 0 },
        // NOTE: real pickup/drop coordinates come from the address-search
        // map (geocode proxy), wired in the Phase 2 client map/booking task.
        // Placeholder [0,0] here until that's merged — submission is
        // expected to be rejected server-side until then, which the catch
        // block below surfaces honestly rather than pretending success.
        pickupLocation: { coordinates: [0, 0], address: pickupAddress },
        dropLocation: { coordinates: [0, 0], address: dropAddress },
        requiredVehicles: type !== 'hamali' ? [{ capacityKg: Number(weightKg) || 0, count: 1 }] : [],
        requiredHamaliCount: type !== 'truck' ? Number(hamaliCount) || 0 : 0,
      });
      router.push(`/customer/track/${res.booking._id}`);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Booking isn’t available yet — this part of FYRO is still rolling out.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-5 pt-6">
      <h1 className="font-heading text-2xl font-bold mb-1">Book a delivery</h1>
      <p className="text-sm text-text-muted mb-6">Tell us what you need moved.</p>

      <div className="grid grid-cols-3 gap-2 mb-6 p-1.5 rounded-lg border border-border bg-surface shadow-sm" role="radiogroup">
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

      <Card elevation="raised">
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            placeholder="Pickup address"
            aria-label="Pickup address"
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            className={inputClass}
            required
          />
          <input
            placeholder="Drop address"
            aria-label="Drop address"
            value={dropAddress}
            onChange={(e) => setDropAddress(e.target.value)}
            className={inputClass}
            required
          />
          {type !== 'hamali' && (
            <input
              type="number"
              placeholder="Cargo weight (kg)"
              aria-label="Cargo weight in kilograms"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className={inputClass}
              required
              min={1}
            />
          )}
          {type !== 'truck' && (
            <input
              type="number"
              placeholder="Number of Hamali workers"
              aria-label="Number of Hamali workers"
              value={hamaliCount}
              onChange={(e) => setHamaliCount(e.target.value)}
              className={inputClass}
              required
              min={1}
            />
          )}
          {error && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <Button type="submit" disabled={loading} className="w-full" size="lg">
            {loading ? 'Booking…' : 'Confirm booking'}
          </Button>
        </form>
      </Card>
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
