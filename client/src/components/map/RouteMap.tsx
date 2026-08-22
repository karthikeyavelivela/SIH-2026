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
  /** Phase 6.3 — ordered intermediate waypoints between pickup and drop. Omit/empty = unchanged single-leg route. */
  stops?: LatLng[];
  /** Assigned driver/hamali's current position, once matched — omit before then. */
  liveMarker?: LatLng;
  /** Which glyph the live marker renders as — truck for a vehicle, a walking-person glyph for a hamali. Defaults to 'truck'. */
  liveMarkerType?: 'truck' | 'hamali';
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

// Phase 6.3 — a small numbered dot per intermediate stop, deliberately
// smaller/plainer than the pickup/drop pins so the route's two real
// endpoints stay visually primary and a multi-stop route doesn't read as
// N equally-important destinations.
function stopIcon(n: number) {
  return L.divIcon({
    className: '',
    html: `<span style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:#4A4740;color:#fff;font:700 11px sans-serif;border:2px solid white;box-shadow:0 2px 5px rgba(15,14,12,.35);">${n}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Real vehicle/person glyphs, not a plain dot — "the pin should glide, not
// jump" per DESIGN.md. The pulsing ring behind the glyph is what actually
// reads as "live" at a glance on a small embedded map; the glide itself
// comes from the global .leaflet-marker-icon transition below, since
// Leaflet repositions markers via an inline CSS transform on every
// setLatLng and a plain CSS transition on that property animates it for
// free, no per-frame JS needed.
function liveGlyph(kind: 'truck' | 'hamali') {
  const glyphSvg =
    kind === 'truck'
      ? '<path d="M2 8h9v6H2z" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M11 10h3.5l2 2.5V14H11z" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="5" cy="15" r="1.3" fill="#fff"/><circle cx="13" cy="15" r="1.3" fill="#fff"/>'
      : '<circle cx="8" cy="4.5" r="1.6" fill="#fff"/><path d="M8 6.5v4.5m0 0-2.5 4M8 11l2.5 4M8 6.5l-2.8 1.6M8 6.5l2.8 1.6" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
  const bg = kind === 'truck' ? '#BF5020' : '#0A6F66';
  return L.divIcon({
    className: '',
    html: `<span style="position:relative;display:block;width:30px;height:30px;">
      <span style="position:absolute;inset:0;border-radius:9999px;background:${bg};opacity:.35;animation:fyroLivePulse 1.8s ease-out infinite;"></span>
      <span style="position:absolute;inset:5px;border-radius:9999px;background:${bg};border:2px solid white;box-shadow:0 2px 8px rgba(15,14,12,.4);display:flex;align-items:center;justify-content:center;">
        <svg width="16" height="16" viewBox="0 0 16 16">${glyphSvg}</svg>
      </span>
    </span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

const liveIconByType = { truck: liveGlyph('truck'), hamali: liveGlyph('hamali') };

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

export default function RouteMap({ pickup, drop, stops = [], liveMarker, liveMarkerType = 'truck', className = '' }: RouteMapProps) {
  const points = [pickup, ...stops, drop, ...(liveMarker ? [liveMarker] : [])];

  return (
    <div className={`overflow-hidden rounded-lg border border-border shadow-sm ${className}`}>
      {/* Global (not scoped) on purpose — Leaflet's marker DOM nodes live
          outside this component's React tree, styled-jsx/CSS modules can't
          reach them. Keyframes + the transition are cheap enough to ship
          unscoped across the whole app. */}
      <style>{`
        .leaflet-marker-icon { transition: transform 0.6s linear; }
        @keyframes fyroLivePulse {
          0% { transform: scale(0.6); opacity: 0.5; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
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
          positions={[pickup, ...stops, drop].map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: '#BF5020', weight: 3, opacity: 0.55, dashArray: '1 10' }}
        />
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />
        {stops.map((s, i) => (
          <Marker key={`${s.lat}-${s.lng}-${i}`} position={[s.lat, s.lng]} icon={stopIcon(i + 1)} />
        ))}
        <Marker position={[drop.lat, drop.lng]} icon={dropIcon} />
        {liveMarker && <Marker position={[liveMarker.lat, liveMarker.lng]} icon={liveIconByType[liveMarkerType]} />}
        <FitBounds points={points} />
      </MapContainer>
    </div>
  );
}
