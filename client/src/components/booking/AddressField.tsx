'use client';

// Address input with live autocomplete against the server's geocode proxy
// (Nominatim, biased toward India nationwide — see
// server/src/services/geocode.service.ts). Debounced so a customer typing a
// full address doesn't fire a request per keystroke, and every request goes
// through the authenticated /api/geocode route, never Nominatim directly
// from the browser.
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiClientError } from '@/lib/api';
import { MapPinPicker } from '@/components/booking/MapPinPicker';
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
  markerColorClass: string; // e.g. 'text-fy-brown' or 'text-fy-green'
}

const DEBOUNCE_MS = 350;

export function AddressField({ label, placeholder, value, onChange, markerColorClass }: AddressFieldProps) {
  const t = useTranslations('booking.pin');
  const [query, setQuery] = useState(value?.address ?? '');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  /* Distinct from "no results": true means we could not search at all,
     because every geocoding provider failed. The old code collapsed both
     into an empty list, which is how a total outage looked to customers
     like "your address does not exist". */
  const [lookupDown, setLookupDown] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
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
        setLookupDown(false);
        setOpen(true);
      } catch (err) {
        // 503 = every provider failed. That is a service outage, and the
        // customer is told so and offered the map instead — never left
        // staring at "no matches" with a dead confirm button.
        setResults([]);
        setLookupDown(err instanceof ApiClientError && err.status === 503);
        setOpen(false);
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

  function selectPinned(point: GeoPoint) {
    onChange(point);
    setQuery(point.address);
    setLookupDown(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-fy-muted mb-1.5">{label}</label>
      <div className="relative">
        <MapPinIcon
          className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] pointer-events-none ${
            value ? markerColorClass : 'text-fy-muted/60'
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
          className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-control border border-fy-hairline bg-fy-bone text-fy-ink placeholder:text-fy-muted/70 transition-colors duration-fast focus:border-fy-brown focus:ring-2 focus:ring-fy-brown/20"
          required
        />
        {loading && (
          <span className="absolute right-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-fy-hairline border-t-fy-brown animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-control border border-fy-hairline bg-fy-card shadow-lg py-1.5"
        >
          {results.map((r, i) => (
            <li key={i} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(r)}
                className="w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-fy-panel transition-colors duration-fast"
              >
                <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-fy-muted" />
                <span className="line-clamp-2">{r.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !loading && results.length === 0 && query.trim().length >= 3 && (
        <div className="absolute z-20 mt-1.5 w-full rounded-control border border-fy-hairline bg-fy-card shadow-lg px-3.5 py-3 text-sm text-fy-muted">
          {t('noMatches', { query })}
        </div>
      )}

      {/* Service outage — stated plainly, with the way out attached. */}
      {lookupDown && !loading && (
        <div
          role="alert"
          className="mt-2 rounded-control border border-fy-brown/25 bg-fy-panel px-3.5 py-3 flex flex-col gap-2"
        >
          <span className="flex items-start gap-2">
            <span aria-hidden className="material-symbols-outlined text-[18px] text-fy-brown leading-none mt-0.5">
              cloud_off
            </span>
            <span className="font-body text-label text-fy-ink-soft">{t('lookupDown')}</span>
          </span>
          <button
            type="button"
            onClick={() => setPinOpen(true)}
            className="self-start inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-fy-brown text-fy-bone font-mono text-[10px] uppercase tracking-wider font-semibold hover:bg-fy-brown-soft transition-colors"
          >
            <span aria-hidden className="material-symbols-outlined text-[15px] text-fy-lime leading-none">
              pin_drop
            </span>
            {t('dropPin')}
          </button>
        </div>
      )}

      {/* Always available, not only during an outage — some addresses simply
          are not in any gazetteer, and a pin is the honest answer for those. */}
      {!lookupDown && (
        <button
          type="button"
          onClick={() => setPinOpen(true)}
          className="mt-1.5 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-fy-muted hover:text-fy-brown transition-colors"
        >
          <span aria-hidden className="material-symbols-outlined text-[14px] leading-none">
            pin_drop
          </span>
          {t('orDropPin')}
        </button>
      )}

      <MapPinPicker open={pinOpen} onClose={() => setPinOpen(false)} onPick={selectPinned} initial={value} />
    </div>
  );
}
