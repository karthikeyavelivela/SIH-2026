'use client';

// Address input with live autocomplete against the server's geocode proxy
// (Nominatim, biased toward India nationwide — see
// server/src/services/geocode.service.ts). Debounced so a customer typing a
// full address doesn't fire a request per keystroke, and every request goes
// through the authenticated /api/geocode route, never Nominatim directly
// from the browser.
import { useEffect, useRef, useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { MapPinIcon } from '@/components/ui/icons';

export interface GeoPoint {
  lat: number;
  lng: number;
  address: string;
  // SIH26089 pan-India rewrite — best-effort district/city name from the
  // geocoder, used to derive the booking's `region` (fare-rule lookup key)
  // instead of a hardcoded city. Absent for a manually-typed point with no
  // matching geocode result (e.g. "Same as pickup" copies it through).
  region?: string;
}

interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  region?: string;
}

interface AddressFieldProps {
  label: string;
  placeholder: string;
  value: GeoPoint | null;
  onChange: (point: GeoPoint | null) => void;
  markerColorClass: string; // e.g. 'text-primary-600' or 'text-secondary-600'
}

const DEBOUNCE_MS = 350;

export function AddressField({ label, placeholder, value, onChange, markerColorClass }: AddressFieldProps) {
  const [query, setQuery] = useState(value?.address ?? '');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Keep the field's text in sync if a point is set from elsewhere (e.g.
  // reset on booking-type switch).
  useEffect(() => {
    setQuery(value?.address ?? '');
  }, [value?.address]);

  function handleInput(next: string) {
    setQuery(next);
    onChange(null); // typing invalidates a previously-selected point
    clearTimeout(debounceRef.current);

    if (next.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<{ results: GeocodeResult[] }>(`/api/geocode?q=${encodeURIComponent(next)}`);
        setResults(res.results);
        setOpen(true);
      } catch (err) {
        // A rate-limit or upstream hiccup here shouldn't block the form —
        // the customer can still type and select from an empty list, or
        // retry the same query a moment later.
        setResults([]);
        setOpen(err instanceof ApiClientError ? false : false);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }

  function select(r: GeocodeResult) {
    onChange({ lat: r.lat, lng: r.lon, address: r.displayName, region: r.region });
    setQuery(r.displayName);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-text-muted mb-1.5">{label}</label>
      <div className="relative">
        <MapPinIcon
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none ${
            value ? markerColorClass : 'text-text-muted/60'
          }`}
        />
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-md border border-border bg-background text-text-primary placeholder:text-text-muted/70 transition-colors duration-fast focus:border-primary-600 focus:ring-2 focus:ring-primary-600/20"
          required
        />
        {loading && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-border-strong border-t-primary-600 animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-md border border-border bg-surface-raised shadow-lg py-1.5"
        >
          {results.map((r, i) => (
            <li key={i} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(r)}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-surface transition-colors duration-fast"
              >
                <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-text-muted" />
                <span className="line-clamp-2">{r.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && results.length === 0 && query.trim().length >= 3 && (
        <div className="absolute z-20 mt-1.5 w-full rounded-md border border-border bg-surface-raised shadow-lg px-3.5 py-3 text-sm text-text-muted">
          No matches for &ldquo;{query}&rdquo;.
        </div>
      )}
    </div>
  );
}
