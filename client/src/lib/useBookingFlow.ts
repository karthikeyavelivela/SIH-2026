'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiClientError } from '@/lib/api';
import { distanceKm } from '@/lib/geo';
import type { GeoPoint } from '@/components/booking/AddressField';
import type { FareBreakdown } from '@/components/booking/FareCard';

/**
 * The booking state machine shared by every /customer/book/<mode> screen.
 *
 * The three modes differ in what they collect (a crew size, a vehicle
 * capacity, a set of materials) and in how they look, but the part underneath
 * — device GPS, pickup/drop/stops, the correctable region, the debounced
 * quote, the submit — is identical, and was previously written out once per
 * page. This is that part, extracted verbatim including the reasons each
 * piece is shaped the way it is.
 */

/** Server ceiling on body('stops') — booking.routes.ts. */
export const MAX_STOPS = 5;

/**
 * How far a selected pickup can sit from the device's GPS reading before we
 * ask "is this pickup for you or someone else?" — wide enough that ordinary
 * GPS drift never trips it, tight enough to catch "I typed my office address
 * out of habit but I'm at home".
 */
const MISMATCH_KM = 2;

export interface BookingFlowOptions {
  /** Dispatch shape. Household and hamali ride 'hamali'; transit rides 'truck'. */
  type: 'truck' | 'hamali' | 'combo';
  /** Sent so the server can derive the real dispatch type from the category. */
  serviceCategorySlug?: string;
  /** True for vehicle bookings, which price on cargo weight. */
  needsWeight: boolean;
  /** True for crew bookings, which price on headcount. */
  needsHamali: boolean;
}

export function useBookingFlow({ type, serviceCategorySlug, needsWeight, needsHamali }: BookingFlowOptions) {
  const router = useRouter();

  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);
  const [stops, setStops] = useState<GeoPoint[]>([]);
  const [weightKg, setWeightKg] = useState('');
  const [hamaliCount, setHamaliCount] = useState(1);

  // Device GPS as the default pickup — requested once on mount (the real
  // browser permission prompt fires here), reverse-geocoded to a human
  // address. Silent on denial or error: the field just stays empty and the
  // customer types normally, rather than failing loudly for something that
  // does not block the core flow.
  const [deviceLocation, setDeviceLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locatingDevice, setLocatingDevice] = useState(true);
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
    // Once on mount only — re-firing would re-prompt and re-fetch pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyed on the dismissed address, not a boolean, so switching to a
  // DIFFERENT mismatched address re-surfaces the check.
  const mismatch = Boolean(
    deviceLocation &&
      pickup &&
      mismatchDismissedFor !== pickup.address &&
      distanceKm(deviceLocation, { lat: pickup.lat, lng: pickup.lng }) > MISMATCH_KM
  );

  // Visible and correctable region: the geocoder's derived region seeds it,
  // but the server only ever sees a plain string with no cross-check against
  // the pickup's own coordinates, so letting the customer override it is
  // real rather than cosmetic. Re-syncs from a new pickup unless it has been
  // edited by hand.
  const [regionOverride, setRegionOverride] = useState('');
  const [regionTouched, setRegionTouched] = useState(false);
  useEffect(() => {
    if (!regionTouched) setRegionOverride(pickup?.region ?? '');
  }, [pickup?.region, regionTouched]);
  const region = regionOverride;

  const [fareState, setFareState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [fare, setFare] = useState<FareBreakdown | null>(null);
  const [fareError, setFareError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /* createBooking refuses a new booking while the customer still owes a
     rating on their last completed one, and names that booking in the
     error's `details`. Without capturing it the customer is told to go and
     rate something with no way to reach it, so the id is held here and the
     form offers a link straight to that job. */
  const [blockedByUnratedId, setBlockedByUnratedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [openForBidding, setOpenForBidding] = useState(false);
  const quoteDebounce = useRef<ReturnType<typeof setTimeout>>();

  const weightValid = !needsWeight || Number(weightKg) > 0;
  const stopsFilled = stops.every((s) => s.address);
  const readyToQuote = Boolean(pickup && drop && weightValid && stopsFilled && (!needsHamali || hamaliCount > 0));

  function pricingBody() {
    return {
      type,
      region,
      pickupLocation: { coordinates: [pickup!.lng, pickup!.lat], address: pickup!.address },
      dropLocation: { coordinates: [drop!.lng, drop!.lat], address: drop!.address },
      stops: stops.map((s) => ({ coordinates: [s.lng, s.lat], address: s.address })),
      requiredVehicles: needsWeight ? [{ capacityKg: Number(weightKg), count: 1 }] : [],
      requiredHamaliCount: needsHamali ? hamaliCount : 0,
      serviceCategorySlug,
    };
  }

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
        const res = await api.post<{ fareBreakdown: FareBreakdown }>('/api/bookings/quote', pricingBody());
        setFare(res.fareBreakdown);
        setFareState('ready');
      } catch (err) {
        setFareError(err instanceof ApiClientError ? err.message : 'Could not estimate the fare.');
        setFareState('error');
      }
    }, 450);

    return () => clearTimeout(quoteDebounce.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, pickup, drop, stops, weightKg, hamaliCount, needsWeight, needsHamali, readyToQuote, serviceCategorySlug, region]);

  /**
   * Creates the booking and routes to its tracking screen.
   * `cargoDetails` is passed by the caller because only the vehicle modes
   * collect goods type / declared value / e-way bill.
   */
  async function submit(cargoDetails: Record<string, unknown>, fallbackError: string) {
    if (!pickup || !drop) return;
    setSubmitError(null);
    setBlockedByUnratedId(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ booking: { _id: string } }>('/api/bookings', {
        ...pricingBody(),
        cargoDetails: { weightKg: needsWeight ? Number(weightKg) : 0, ...cargoDetails },
        scheduledFor: scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
        // Bidding is never combined with a scheduled booking — enforced
        // again server-side in createBooking.
        openForBidding: !scheduledFor ? openForBidding : undefined,
      });
      router.push(`/customer/track/${res.booking._id}`);
    } catch (err) {
      setSubmitError(err instanceof ApiClientError ? err.message : fallbackError);
      if (err instanceof ApiClientError) {
        const details = err.details as { unratedBookingId?: string } | undefined;
        if (details?.unratedBookingId) setBlockedByUnratedId(details.unratedBookingId);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return {
    pickup,
    setPickup,
    drop,
    setDrop,
    stops,
    setStops,
    weightKg,
    setWeightKg,
    hamaliCount,
    setHamaliCount,
    deviceLocation,
    locatingDevice,
    mismatch,
    dismissMismatch: () => setMismatchDismissedFor(pickup?.address ?? null),
    region,
    setRegion: (v: string) => {
      setRegionTouched(true);
      setRegionOverride(v);
    },
    fare,
    fareState,
    fareError,
    readyToQuote,
    scheduledFor,
    setScheduledFor,
    openForBidding,
    setOpenForBidding,
    submit,
    submitting,
    submitError,
    blockedByUnratedId,
  };
}
