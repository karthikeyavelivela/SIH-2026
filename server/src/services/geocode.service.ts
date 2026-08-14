// Andhra Pradesh bounding box (lon-min, lat-min, lon-max, lat-max), used to
// bias Nominatim results so AP addresses rank first instead of defaulting
// to global/US results.
const AP_VIEWBOX = '76.76,19.91,84.79,12.62';

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
    headers: { 'User-Agent': 'FYRO-logistics-app/1.0' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return data.map((d) => ({ lat: parseFloat(d.lat), lon: parseFloat(d.lon), displayName: d.display_name }));
}
