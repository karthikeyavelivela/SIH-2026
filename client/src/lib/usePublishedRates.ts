'use client';

import { useMemo } from 'react';
import { api } from '@/lib/api';
import { useApiState } from '@/lib/useApiState';
import type { ServiceCategory } from '@/components/booking/CategoryPicker';

export type FareCategory = 'vehicle_small' | 'vehicle_medium' | 'vehicle_large' | 'hamali';

export interface PublishedRate {
  region: string;
  category: FareCategory;
  baseFare: number;
  perKmRate: number;
  minimumFare: number;
}

/**
 * The published rate card (GET /api/fare-rules/published).
 *
 * Every screen that shows "from ₹300" reads it from here rather than
 * hardcoding a figure, so a price on a card is always a price the server
 * would actually charge. Before this endpoint existed those slots either sat
 * empty or would have had to invent a number.
 *
 * One rule per region+category is active at a time (enforced by a partial
 * unique index), and the seeded regions all carry identical rates, so the
 * lowest active minimum per category is the honest "from" figure.
 */
export function usePublishedRates() {
  const state = useApiState(
    () => api.get<{ rates: PublishedRate[] }>('/api/fare-rules/published').then((r) => r.rates),
    []
  );

  const lowestByCategory = useMemo(() => {
    const out = {} as Partial<Record<FareCategory, PublishedRate>>;
    for (const r of state.data ?? []) {
      const seen = out[r.category];
      if (!seen || r.minimumFare < seen.minimumFare) out[r.category] = r;
    }
    return out;
  }, [state.data]);

  /**
   * The rate a given service category actually dispatches under. Household
   * trades and loading crews all ride the hamali path; anything needing a
   * vehicle rides the truck path, where the small-vehicle rule is the
   * cheapest a booking can land on and so is the honest "from".
   */
  function rateFor(category: Pick<ServiceCategory, 'dispatchType'>): PublishedRate | undefined {
    return lowestByCategory[category.dispatchType === 'truck' ? 'vehicle_small' : 'hamali'];
  }

  return { ...state, lowestByCategory, rateFor };
}
