'use client';

// Real Leaflet map — pickup/drop pins plus an optional route line and a
// live third marker (assigned driver/hamali position, once Phase 3 sockets
// stream it). This file is a plain client component; every page that
// renders it MUST dynamic-import it with { ssr: false } — react-leaflet
// touches `window` at module scope and breaks Next's server render pass
// otherwise.
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

export interface LatLng {
  lat: number;
  lng: number;
}

interface RouteMapProps {
  pickup: LatLng;
  drop: LatLng;
  /** Assigned driver/hamali's current position, once matched — omit before then. */
  liveMarker?: LatLng;
  className?: string;
}

// divIcon HTML, not a React tree — Leaflet owns this DOM node directly.
// Colors are the same -600 shades used everywhere else (pickup = primary/
// orange, drop = secondary/teal) so the map reads as part of the same
// system as the surrounding cards, not a bolted-on widget.
function pinIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<svg width="30" height="38" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 4px rgba(15,14,12,.35))">
      <path d="M12 29S2 17.8 2 11a10 10 0 1 1 20 0c0 6.8-10 18-10 18Z" fill="${color}"/>
      <circle cx="12" cy="11" r="4.2" fill="white"/>
    </svg>`,
    iconSize: [30, 38],
    iconAnchor: [15, 36],
  });
}

const pickupIcon = pinIcon('#BF5020');
const dropIcon = pinIcon('#0A6F66');

const liveIcon = L.divIcon({
  className: '',
  html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#BF5020;border:3px solid white;box-shadow:0 2px 8px rgba(15,14,12,.4)"></span>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Keeps the viewport fit to whatever points are currently relevant instead
// of a fixed center/zoom — the same map component serves a short intra-
// city hop and a long cross-region one.
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13);
      return;
    }
    map.fitBounds(
      points.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [40, 40], maxZoom: 15 }
    );
  }, [map, points]);
  return null;
}

export default function RouteMap({ pickup, drop, liveMarker, className = '' }: RouteMapProps) {
  const points = [pickup, drop, ...(liveMarker ? [liveMarker] : [])];

  return (
    <div className={`overflow-hidden rounded-lg border border-border shadow-sm ${className}`}>
      <MapContainer
        center={[pickup.lat, pickup.lng]}
        zoom={13}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
        // AP-region tile fetches don't need attribution control cluttering
        // a small embedded map — OSM's required attribution still renders
        // via the TileLayer's `attribution` prop below, just unobtrusively.
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Polyline
          positions={[
            [pickup.lat, pickup.lng],
            [drop.lat, drop.lng],
          ]}
          pathOptions={{ color: '#BF5020', weight: 3, opacity: 0.55, dashArray: '1 10' }}
        />
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />
        <Marker position={[drop.lat, drop.lng]} icon={dropIcon} />
        {liveMarker && <Marker position={[liveMarker.lat, liveMarker.lng]} icon={liveIcon} />}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
