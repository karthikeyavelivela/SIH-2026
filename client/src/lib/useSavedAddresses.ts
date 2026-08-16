'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface SavedAddress {
  _id: string;
  label: string;
  address: string;
  coordinates: [number, number]; // [lng, lat]
}

// "Address can be saved with multiple names" — Home/Work/Site, backing
// /api/addresses. Loaded once per booking-form session; the form is the
// only consumer today.
export function useSavedAddresses() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ addresses: SavedAddress[] }>('/api/addresses');
      setAddresses(res.addresses);
    } catch {
      // Non-critical — booking form works fine with an empty saved list.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = useCallback(
    async (label: string, address: string, lat: number, lng: number) => {
      await api.post('/api/addresses', { label, address, lat, lng });
      await reload();
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await api.delete(`/api/addresses/${id}`);
      await reload();
    },
    [reload]
  );

  return { addresses, loaded, save, remove };
}
