// India bounding box (lon-min, lat-min, lon-max, lat-max) — SIH26089 is a
// national scheme, not AP-specific (see SIH_READINESS.md's Phase A gap
// analysis and the pan-India rewrite this replaces). `bounded=0` below
// means this is a soft bias (rank India results first), never a hard
// exclusion — an address just outside this box still matches, unlike the
// old AP-only viewbox which used `bounded=1` and silently dropped anything
// outside Andhra Pradesh.
const INDIA_VIEWBOX = '68.1,37.6,97.4,6.4';

const FETCH_TIMEOUT_MS = 5000;

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  // Best-effort district/city name for FareRule region matching — never
  // guaranteed to exactly match a seeded FareRule.region (OSM's own data
  // quality varies address to address); booking creation's existing
  // "No active fare rule for {region}/{category}" error is what actually
  // surfaces an unserved region honestly, this is just the input to that.
  region?: string;
}

function extractRegion(address: Record<string, string> | undefined): string | undefined {
  if (!address) return undefined;
  const raw =
    address.state_district ?? address.county ?? address.city ?? address.town ?? address.state;
  if (!raw) return undefined;
  // OSM's state_district often carries a literal "... District" suffix
  // (e.g. "Guntur District") that a FareRule.region seeded as plain
  // "Guntur" won't match — stripped here so the common case lines up
  // without silently fabricating a match for an actually-different string.
  return raw.replace(/\s+district$/i, '').trim();
}

export async function geocodeAddress(query: string): Promise<GeocodeResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('viewbox', INDIA_VIEWBOX);
  url.searchParams.set('bounded', '0');
  url.searchParams.set('countrycodes', 'in');
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
  const data = (await res.json()) as { lat: string; lon: string; display_name: string; address?: Record<string, string> }[];
  return data.map((d) => ({
    lat: parseFloat(d.lat),
    lon: parseFloat(d.lon),
    displayName: d.display_name,
    region: extractRegion(d.address),
  }));
}

// Coords -> address, for "use my current location" — the booking form
// prefills pickup from the device's GPS reading, which needs a human
// address string, not just a lat/lng pair, to show/store.
export async function reverseGeocode(lat: number, lon: number): Promise<GeocodeResult | null> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': 'FYRO-logistics-app/1.0 (contact: velivelakarthikeya@gmail.com)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    // eslint-disable-next-line no-console
    console.error(`reverseGeocode: Nominatim returned ${res.status} for ${lat},${lon}`);
    return null;
  }
  const data = (await res.json()) as { lat?: string; lon?: string; display_name?: string; address?: Record<string, string>; error?: string };
  if (!data.display_name) return null;
  return {
    lat: parseFloat(data.lat ?? String(lat)),
    lon: parseFloat(data.lon ?? String(lon)),
    displayName: data.display_name,
    region: extractRegion(data.address),
  };
}
