import { env } from '../config/env';
import { FareRule } from '../models/FareRule';

/* Address lookup.
 *
 * This used to call the free public Nominatim endpoint directly. On
 * 2026-09-12 that endpoint began returning 429 to this server's egress IP
 * for every single query, and because the old code turned any non-OK
 * upstream response into an empty result array, the entire product's
 * booking flow died silently: no suggestions, no coordinates, a permanently
 * disabled confirm button, and no error anywhere a user could see. Nominatim's
 * own usage policy forbids using the public instance as an application
 * backend, so that outcome was a matter of time.
 *
 * Two things changed as a result.
 *
 * 1. A PROVIDER CHAIN instead of one hard dependency:
 *      LocationIQ (keyed, generous free tier)
 *        -> Photon (keyless, Komoot's public instance)
 *        -> a small built-in table, NON-PRODUCTION ONLY
 *    Each step is tried only when the one before it errors or rate-limits.
 *
 *    The built-in table is deliberately NOT available in production. A
 *    geocoder that invents coordinates when it cannot reach a provider would
 *    let someone book a real worker to a real address at the wrong place —
 *    a fabricated location is far worse than a visible failure. It exists so
 *    the booking flow is still developable offline, and nowhere else.
 *
 * 2. FAILURE IS NOW DISTINGUISHABLE FROM EMPTINESS. Every function returns
 *    a status alongside its results, so a caller can tell "we searched and
 *    that address does not exist" from "we could not search at all". The
 *    controller turns the second into a real 503 the UI can show.
 */

/** India bounding box (lon-min, lat-min, lon-max, lat-max) — a soft bias, never a hard exclusion. */
const INDIA_VIEWBOX = { minLon: 68.1, minLat: 6.4, maxLon: 97.4, maxLat: 37.6 };

const FETCH_TIMEOUT_MS = 5000;

/** How long a successful lookup is reused. Short enough to stay fresh, long
 *  enough that a customer retyping one character does not spend quota. */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  /** Best-effort district/city for FareRule region matching. */
  region?: string;
}

/** Why a lookup returned what it returned. */
export type GeocodeStatus =
  /** A provider answered. `results` is authoritative — empty means no match. */
  | 'ok'
  /** Every provider failed. `results` is empty because we could not search. */
  | 'unavailable';

export interface GeocodeOutcome {
  status: GeocodeStatus;
  results: GeocodeResult[];
  /** Which provider answered, for logs and the admin-facing health view. */
  provider?: string;
  /** Present when status is 'unavailable' — the last upstream failure seen. */
  detail?: string;
}

export interface ReverseOutcome {
  status: GeocodeStatus;
  result: GeocodeResult | null;
  provider?: string;
  detail?: string;
}

// ---------------------------------------------------------------- cache

interface CacheEntry {
  at: number;
  outcome: GeocodeOutcome;
}
const forwardCache = new Map<string, CacheEntry>();

function cacheKey(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readCache(q: string): GeocodeOutcome | null {
  const hit = forwardCache.get(cacheKey(q));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    forwardCache.delete(cacheKey(q));
    return null;
  }
  return hit.outcome;
}

function writeCache(q: string, outcome: GeocodeOutcome) {
  // Only successful lookups are cached. Caching a failure would keep the
  // whole app broken for the TTL after the provider recovered.
  if (outcome.status !== 'ok') return;
  if (forwardCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = forwardCache.keys().next().value;
    if (oldest) forwardCache.delete(oldest);
  }
  forwardCache.set(cacheKey(q), { at: Date.now(), outcome });
}

// ------------------------------------------------------------- helpers

/**
 * Normalise a provider's administrative name to the form FareRule.region is
 * seeded in.
 *
 * Indian admin areas come back with suffixes that vary by provider and by
 * record: OSM's `state_district` is often "Guntur District", and Photon's
 * `county` for Visakhapatnam is "Visakhapatnam Urban". A FareRule seeded as
 * plain "Visakhapatnam" matches neither, and booking creation then fails with
 * "No active fare rule for Visakhapatnam Urban/hamali" — which is exactly
 * what happened the first time this chain ran against Photon.
 */
const ADMIN_SUFFIX = /(?:\s*\((?:urban|rural)\)|\s+(?:mandal|taluk|taluka|tehsil|district|division|urban|rural|north|south|east|west|central))$/i;

/**
 * Progressively strip administrative suffixes, most specific first.
 *
 * Photon's `county` for Khammam is "Khammam Urban mandal" and for Nizamabad
 * "Nizamabad South mandal"; LocationIQ's `state_district` is often
 * "Guntur District" and its county "Visakhapatnam (Rural)". Each strip is
 * a separate candidate rather than one final answer, because the priced
 * region can sit at any depth — "Bengaluru Urban" IS a seeded region, so
 * stripping all the way down would destroy it.
 */
function regionForms(raw?: string): string[] {
  const forms: string[] = [];
  let cur = raw?.trim() ?? '';
  while (cur) {
    if (!forms.includes(cur)) forms.push(cur);
    const next = cur.replace(ADMIN_SUFFIX, '').trim();
    if (next === cur) break;
    cur = next;
  }
  return forms;
}

function normaliseRegion(raw?: string): string | undefined {
  const forms = regionForms(raw);
  return forms[forms.length - 1] || undefined;
}

/**
 * The regions that actually carry an active fare rule.
 *
 * Region is not a label here — it is the key a booking is priced on, and a
 * region with no rule fails booking creation outright. So rather than guess
 * which of a provider's half-dozen administrative fields happens to be the
 * one a rule was seeded under, ask the rules themselves. Cached because this
 * runs on every suggestion keystroke and the set changes about as often as
 * an admin publishes a tariff.
 */
let pricedRegions: Set<string> | null = null;
let pricedRegionsAt = 0;
const PRICED_REGION_TTL_MS = 5 * 60 * 1000;

async function ensurePricedRegions() {
  if (pricedRegions && Date.now() - pricedRegionsAt < PRICED_REGION_TTL_MS) return;
  try {
    const rows = (await FareRule.distinct('region', { active: true })) as string[];
    pricedRegions = new Set(rows.map((r) => String(r).trim()));
    pricedRegionsAt = Date.now();
  } catch {
    // A DB hiccup must not take address search down with it — fall through
    // to whatever set is already cached, or to the plain first-field guess.
  }
}

/**
 * Pick the field most likely to equal a seeded FareRule.region.
 *
 * `candidates` are the provider's administrative fields in the order we
 * would fall back to them. `hints` are fields that are only trustworthy when
 * they happen to BE a priced region — Photon returns no district at all for
 * a Telangana city and puts the district name in `name`, but `name` is also
 * "Klef Road" for a street query, so it may never be the fallback.
 */
function pickRegion(candidates: (string | undefined)[], hints: (string | undefined)[] = []): string | undefined {
  const clean = (xs: (string | undefined)[]) => xs.map((c) => c?.trim()).filter((c): c is string => !!c);
  const cleaned = clean(candidates);
  const hinted = clean(hints);

  // Any form of any field that IS a priced region wins outright, whatever its
  // rank — that is what makes a village work: LocationIQ's `city` for
  // Vaddeswaram is "Vaddeswaram", which no rule is keyed on, while its
  // `state_district` is "Guntur", which is. Exact matches are tried across
  // everything before any stripped form, so a region seeded WITH a suffix
  // ("Bengaluru Urban") is never stripped away.
  for (const c of [...cleaned, ...hinted]) if (pricedRegions?.has(c)) return c;
  for (const c of [...cleaned, ...hinted]) {
    for (const form of regionForms(c)) if (pricedRegions?.has(form)) return form;
  }

  // Nothing here is priced. Return the most local name anyway rather than
  // nothing: the customer can see and correct it on the booking form, and
  // the server's own "No active fare rule for X" then names something real.
  return normaliseRegion(cleaned[0] ?? hinted[0]);
}


function inIndia(lat: number, lon: number) {
  return (
    lat >= INDIA_VIEWBOX.minLat &&
    lat <= INDIA_VIEWBOX.maxLat &&
    lon >= INDIA_VIEWBOX.minLon &&
    lon <= INDIA_VIEWBOX.maxLon
  );
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    // Photon and LocationIQ both want an identifying agent; sending one is
    // also what keeps us in good standing with their fair-use policies.
    headers: { 'User-Agent': 'FYRO-cooperative-logistics/1.0 (contact: velivelakarthikeya@gmail.com)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ----------------------------------------------------------- providers

interface Provider {
  name: string;
  available: () => boolean;
  forward: (q: string) => Promise<GeocodeResult[]>;
  reverse: (lat: number, lon: number) => Promise<GeocodeResult | null>;
}

/** LocationIQ — keyed, Nominatim-compatible response shape. */
const locationIq: Provider = {
  name: 'locationiq',
  available: () => Boolean(env.LOCATIONIQ_API_KEY),
  async forward(q) {
    const url = new URL('https://us1.locationiq.com/v1/search');
    url.searchParams.set('key', env.LOCATIONIQ_API_KEY as string);
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('limit', '5');
    const data = (await getJson(url.toString())) as {
      lat: string;
      lon: string;
      display_name: string;
      address?: Record<string, string>;
    }[];
    if (!Array.isArray(data)) return [];
    return data.map((d) => ({
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      displayName: d.display_name,
      region: pickRegion([
        d.address?.city,
        d.address?.town,
        d.address?.state_district,
        d.address?.county,
        d.address?.state,
      ]),
    }));
  },
  async reverse(lat, lon) {
    const url = new URL('https://us1.locationiq.com/v1/reverse');
    url.searchParams.set('key', env.LOCATIONIQ_API_KEY as string);
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    const d = (await getJson(url.toString())) as {
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: Record<string, string>;
    };
    if (!d?.display_name) return null;
    return {
      lat: parseFloat(d.lat ?? String(lat)),
      lon: parseFloat(d.lon ?? String(lon)),
      displayName: d.display_name,
      region: pickRegion([
        d.address?.city,
        d.address?.town,
        d.address?.state_district,
        d.address?.county,
        d.address?.state,
      ]),
    };
  },
};

/** Photon (Komoot) — keyless. Different response shape (GeoJSON). */
const photon: Provider = {
  name: 'photon',
  available: () => true,
  async forward(q) {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', '5');
    // Bias toward India's centre; Photon has no country filter, so
    // out-of-box results are dropped below rather than shown.
    url.searchParams.set('lat', '20.6');
    url.searchParams.set('lon', '78.9');
    const data = (await getJson(url.toString())) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }[];
    };
    return (data.features ?? [])
      .map((f) => {
        const [lon, lat] = f.geometry?.coordinates ?? [NaN, NaN];
        const p = f.properties ?? {};
        const label = [p.name, p.street, p.district, p.city, p.county, p.state, p.country]
          .filter(Boolean)
          .join(', ');
        return {
          lat,
          lon,
          displayName: label || p.name || 'Unnamed location',
          region: pickRegion([p.city, p.district, p.county, p.state], [p.name]),
        };
      })
      .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && inIndia(r.lat, r.lon));
  },
  async reverse(lat, lon) {
    const url = new URL('https://photon.komoot.io/reverse');
    url.searchParams.set('lat', String(lat));
    url.searchParams.set('lon', String(lon));
    const data = (await getJson(url.toString())) as {
      features?: { geometry?: { coordinates?: [number, number] }; properties?: Record<string, string> }[];
    };
    const f = (data.features ?? [])[0];
    if (!f) return null;
    const p = f.properties ?? {};
    const label = [p.name, p.street, p.district, p.city, p.county, p.state].filter(Boolean).join(', ');
    return {
      lat,
      lon,
      displayName: label || 'Selected location',
      region: pickRegion([p.city, p.district, p.county, p.state], [p.name]),
    };
  },
};

/**
 * A handful of real Andhra Pradesh coordinates so the booking flow stays
 * developable with no network. NEVER used in production — see the file
 * header for why a geocoder must not invent locations on a live system.
 */
const OFFLINE_PLACES: GeocodeResult[] = [
  { lat: 17.6868, lon: 83.2185, displayName: 'Visakhapatnam, Andhra Pradesh, India', region: 'Visakhapatnam' },
  { lat: 16.5062, lon: 80.648, displayName: 'Vijayawada, NTR, Andhra Pradesh, India', region: 'Vijayawada' },
  { lat: 16.3067, lon: 80.4365, displayName: 'Guntur, Andhra Pradesh, India', region: 'Guntur' },
  { lat: 16.4419, lon: 80.6224, displayName: 'Vaddeswaram, Guntur, Andhra Pradesh, India', region: 'Guntur' },
  { lat: 14.4426, lon: 79.9865, displayName: 'Nellore, Andhra Pradesh, India', region: 'Nellore' },
  { lat: 13.6288, lon: 79.4192, displayName: 'Tirupati, Andhra Pradesh, India', region: 'Tirupati' },
];

const offline: Provider = {
  name: 'offline-table',
  available: () => env.NODE_ENV !== 'production',
  async forward(q) {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return OFFLINE_PLACES.filter((p) => p.displayName.toLowerCase().includes(needle)).slice(0, 5);
  },
  async reverse(lat, lon) {
    // Nearest known point, so "use my location" still resolves offline.
    let best: GeocodeResult | null = null;
    let bestD = Infinity;
    for (const p of OFFLINE_PLACES) {
      const d = (p.lat - lat) ** 2 + (p.lon - lon) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  },
};

/** Order matters: keyed provider first, keyless fallback, offline last. */
const PROVIDERS: Provider[] = [locationIq, photon, offline];

// ------------------------------------------------------------- lookups

export async function geocodeAddress(query: string): Promise<GeocodeOutcome> {
  const cached = readCache(query);
  if (cached) return cached;

  await ensurePricedRegions();
  const failures: string[] = [];

  for (const provider of PROVIDERS) {
    if (!provider.available()) continue;
    try {
      const results = await provider.forward(query);
      const outcome: GeocodeOutcome = { status: 'ok', results, provider: provider.name };
      writeCache(query, outcome);
      return outcome;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`${provider.name}: ${reason}`);
      // eslint-disable-next-line no-console
      console.error(`geocodeAddress: ${provider.name} failed for "${query}" — ${reason}`);
    }
  }

  // Every provider failed. Returning an empty 'ok' here is precisely the bug
  // this rewrite exists to remove — the caller must be able to say so.
  return { status: 'unavailable', results: [], detail: failures.join(' | ') || 'no provider available' };
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseOutcome> {
  await ensurePricedRegions();
  const failures: string[] = [];

  for (const provider of PROVIDERS) {
    if (!provider.available()) continue;
    try {
      const result = await provider.reverse(lat, lon);
      return { status: 'ok', result, provider: provider.name };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`${provider.name}: ${reason}`);
      // eslint-disable-next-line no-console
      console.error(`reverseGeocode: ${provider.name} failed for ${lat},${lon} — ${reason}`);
    }
  }

  return { status: 'unavailable', result: null, detail: failures.join(' | ') || 'no provider available' };
}
