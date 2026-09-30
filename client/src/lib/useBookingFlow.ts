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
  /**
   * Starting cargo weight in kg, for pages whose slider opens part-way up
   * its range. It must live in state rather than being a display-only
   * fallback in the page: `readyToQuote` reads the state, so a page that
   * showed 15 t while the state held '' looked complete and priced nothing
   * — the quote never fired and the submit button stayed disabled until the
   * customer happened to touch the slider.
   */
  initialWeightKg?: number;
}

export function useBookingFlow({
  type,
  serviceCategorySlug,
  needsWeight,
  needsHamali,
  initialWeightKg,
}: BookingFlowOptions) {
  const router = useRouter();

  const [pickup, setPickup] = useState<GeoPoint | null>(null);
  const [drop, setDrop] = useState<GeoPoint | null>(null);
  const [stops, setStops] = useState<GeoPoint[]>([]);
  const [weightKg, setWeightKg] = useState(initialWeightKg ? String(initialWeightKg) : '');
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
          const res = await api.get<{ result: { lat: number; lon: number; displayName: string; region?: string } | null }>(
            `/api/geocode/reverse?lat=${loc.lat}&lng=${loc.lng}`
          );
          if (res.result) {
            // The region comes back on this same response and was being
            // thrown away, which left the fare lookup keyed on an empty
            // string for anyone who let the device fill their pickup in.
            setPickup((current) => current ?? {
              lat: res.result!.lat,
              lng: res.result!.lon,
              address: res.result!.displayName,
              region: res.result!.region,
            });
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

  /*
   * Backfill the region from the pickup's coordinates when whatever set the
   * pickup did not carry one.
   *
   * Only the address-search field and the map pin ever attached a region.
   * A saved-address chip is stored as label + coordinates and nothing else,
   * so picking "Home" as the pickup silently blanked it — which is how a
   * Tirupati booking reached the API as `region: ""` and came back "No
   * active fare rule for /vehicle_large" with an empty slug. (Every one of
   * the 43 seeded regions does have all four rules; nothing was missing.)
   *
   * Doing it here rather than in each caller means any future path that
   * sets a pickup — a deep link, a repeat-booking shortcut — is covered by
   * construction. A hand-edited region is never overwritten.
   */
  useEffect(() => {
    if (regionTouched || !pickup || pickup.region || regionOverride) return;
    let cancelled = false;
    api
      .get<{ result: { region?: string } | null }>(`/api/geocode/reverse?lat=${pickup.lat}&lng=${pickup.lng}`)
      .then((res) => {
        if (!cancelled && res.result?.region) setRegionOverride(res.result.region);
      })
      .catch(() => {
        // Leave it blank. The field is visible and editable, and the
        // customer correcting it is better than a guess that prices wrong.
      });
    return () => {
      cancelled = true;
    };
  }, [pickup, regionTouched, regionOverride]);

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
  // P1.4 — only meaningful for a booking for now, never scheduled or bid.
  const [urgent, setUrgent] = useState(false);
  const quoteDebounce = useRef<ReturnType<typeof setTimeout>>();

  const weightValid = !needsWeight || Number(weightKg) > 0;
  const stopsFilled = stops.every((s) => s.address);
  const readyToQuote = Boolean(pickup && drop && weightValid && stopsFilled && (!needsHamali || hamaliCount > 0));

  /*
   * Enough to quote is not the same as enough to book.
   *
   * When the quote comes back 422 the booking will fail with the identical
   * message, so pressing submit only reprinted it — which is why the
   * transport screen showed "No active fare rule for /vehicle_large" twice,
   * once in the fare card and once as a red banner underneath. Gating the
   * button on the fare means the message has exactly one home, and the
   * customer is not invited to submit something that cannot be priced.
   */
  const canSubmit = readyToQuote && fareState !== 'error' && !submitting;

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
        urgent: !scheduledFor && !openForBidding && urgent ? true : undefined,
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
    canSubmit,
    scheduledFor,
    setScheduledFor,
    openForBidding,
    setOpenForBidding,
    urgent,
    setUrgent,
    submit,
    submitting,
    submitError,
    blockedByUnratedId,
  };
}
