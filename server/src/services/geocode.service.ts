// Andhra Pradesh bounding box (lon-min, lat-min, lon-max, lat-max), used to
// bias Nominatim results so AP addresses rank first instead of defaulting
// to global/US results.
const AP_VIEWBOX = '76.76,19.91,84.79,12.62';

const FETCH_TIMEOUT_MS = 5000;

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
}

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('viewbox', AP_VIEWBOX);
  url.searchParams.set('bounded', '1');
  url.searchParams.set('limit', '5');

  const res = await fetch(url.toString(), {
    // Nominatim's usage policy requires a real identifying User-Agent
    // (app name + contact) — this endpoint is now reachable by any
    // authenticated user, so an unbounded/unidentified relay risks the
    // whole app's egress IP getting banned by Nominatim, breaking
    // geocoding for every user at once.
    headers: { 'User-Agent': 'FYRO-logistics-app/1.0 (contact: velivelakarthikeya@gmail.com)' },
    // No default timeout on Node's fetch — without this, a slow/hung
    // Nominatim response holds the connection open indefinitely. Now that
    // this is reachable by any authenticated user (not dead code), an
    // unbounded fetch is a real resource-exhaustion vector.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // A 429/503 from Nominatim looks identical to "no address matched" if
    // this silently returns []. Logging the upstream status is the only
    // signal ops has that geocoding degraded for every user, not just this
    // one query — this endpoint is the one place a third party can
    // unilaterally break a feature for the whole app.
    // eslint-disable-next-line no-console
    console.error(`geocodeAddress: Nominatim returned ${res.status} for query "${query}"`);
    return [];
  }
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return data.map((d) => ({ lat: parseFloat(d.lat), lon: parseFloat(d.lon), displayName: d.display_name }));
}

// Coords -> address, for "use my current location" — the booking form
// prefills pickup from the device's GPS reading, which needs a human
// address string, not just a lat/lng pair, to show/store.
export async function reverseGeocode(lat: number, lon: number): Promise<GeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'json');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'FYRO-logistics-app/1.0 (contact: velivelakarthikeya@gmail.com)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`reverseGeocode: Nominatim returned ${res.status} for ${lat},${lon}`);
    return null;
  }
  const data = (await res.json()) as { lat?: string; lon?: string; display_name?: string; error?: string };
  if (!data.display_name) return null;
  return { lat: parseFloat(data.lat ?? String(lat)), lon: parseFloat(data.lon ?? String(lon)), displayName: data.display_name };
}
